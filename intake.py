"""Vendor invoice, receipt and voucher intake.

A file is stored on submission. It is posted to the register only after the
vendor and Welingkar have both approved it.
"""
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

MAX_BYTES = 10 * 1024 * 1024
KINDS = ('invoice', 'receipt', 'voucher')
UNITS = ('', 'Autonomous', 'Bengaluru', 'PGDM', 'University')
SESSION_COOKIE = 'wk_intake'
SESSION_HOURS = 12

def utcnow():
    return datetime.now(timezone.utc).replace(microsecond=0)

def iso(moment):
    return moment.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def sniff(data):
    if data.startswith(b'%PDF-'):
        return 'application/pdf'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return None

def hash_password(password):
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode('utf-8'), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + '$' + digest.hex()

def verify_password(password, stored):
    try:
        salt_hex, digest_hex = stored.split('$', 1)
        digest = hashlib.scrypt(password.encode('utf-8'), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
        return hmac.compare_digest(digest, bytes.fromhex(digest_hex))
    except (ValueError, TypeError):
        return False

def document_day(raw):
    day = (raw or '').strip()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day):
        raise ValueError('Enter the document date.')
    try:
        datetime.strptime(day, '%Y-%m-%d')
    except ValueError as exc:
        raise ValueError('Enter the document date.') from exc
    return day

def parse_amount(raw):
    text = (raw or '').strip().replace(',', '').replace('₹', '').replace(' ', '')
    if not text:
        return None
    if not re.fullmatch(r'-?\d{1,12}(\.\d{1,2})?', text):
        raise ValueError('Enter the document amount in rupees, with at most two decimal places.')
    sign = -1 if text.startswith('-') else 1
    whole, _, frac = text.lstrip('-').partition('.')
    paise = int(whole) * 100 + int((frac + '00')[:2])
    return sign * paise

def clean_text(value, limit, label):
    text = ' '.join((value or '').split())
    if len(text) > limit:
        raise ValueError(f'{label} must be {limit} characters or fewer.')
    return text

def parse_multipart(content_type, body):
    match = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type or '', re.I)
    if not match or 'multipart/form-data' not in (content_type or '').lower():
        raise ValueError('Choose a PDF or image to upload.')
    boundary = (match.group(1) or match.group(2)).strip().encode('utf-8')
    fields, uploaded = {}, None
    for part in body.split(b'--' + boundary)[1:]:
        if part.startswith(b'--'):
            break
        if part.startswith(b'\r\n'):
            part = part[2:]
        if part.endswith(b'\r\n'):
            part = part[:-2]
        header_blob, separator, data = part.partition(b'\r\n\r\n')
        if not separator:
            continue
        disposition = ''
        for line in header_blob.decode('utf-8', 'replace').split('\r\n'):
            if line.lower().startswith('content-disposition:'):
                disposition = line.split(':', 1)[1]
        name = re.search(r'name="([^"]*)"', disposition)
        if not name:
            continue
        filename = re.search(r'filename="([^"]*)"', disposition)
        if filename:
            uploaded = {'filename': Path(filename.group(1)).name, 'data': data}
        else:
            fields[name.group(1)] = data.decode('utf-8', 'replace')
    return fields, uploaded

class IntakeStore:
    def __init__(self, data_dir, college_username, college_password):
        self.root = Path(data_dir)
        self.files = self.root / 'files'
        self.db_path = self.root / 'intake.sqlite'
        self.college_username = (college_username or '').strip()
        self.college_password = college_password or ''
        self.root.mkdir(parents=True, exist_ok=True)
        self.files.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS vendors (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    organisation TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS submissions (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    vendor_id TEXT NOT NULL,
                    organisation TEXT NOT NULL,
                    document_number TEXT NOT NULL,
                    document_date TEXT NOT NULL,
                    amount_paise INTEGER,
                    unit TEXT NOT NULL DEFAULT '',
                    note TEXT NOT NULL DEFAULT '',
                    original_name TEXT NOT NULL,
                    mime TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    storage_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    vendor_approved_at TEXT,
                    vendor_approved_by TEXT,
                    college_approved_at TEXT,
                    college_approved_by TEXT,
                    return_note TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            ''')

    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def college_actor(self):
        if not self.college_username:
            return None
        return {'id': 'college', 'role': 'college', 'username': self.college_username, 'name': 'Welingkar', 'organisation': 'Welingkar'}

    def authenticate(self, username, password):
        user = (username or '').strip().lower()
        if self.college_username and user == self.college_username.lower() and hmac.compare_digest(password or '', self.college_password):
            return self.college_actor()
        with self.connect() as db:
            row = db.execute('SELECT * FROM vendors WHERE username=? AND active=1', (user,)).fetchone()
        if row and verify_password(password or '', row['password_hash']):
            return self.vendor_actor(row)
        return None

    def vendor_actor(self, row):
        return {'id': row['id'], 'role': 'vendor', 'username': row['username'], 'name': row['name'], 'organisation': row['organisation']}

    def add_vendor(self, name, organisation, username, password):
        display = clean_text(name, 80, 'Contact name')
        org = clean_text(organisation, 120, 'Vendor name')
        user = (username or '').strip().lower()
        if not display or not org:
            raise ValueError('Enter the vendor name and a contact name.')
        if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{2,39}', user):
            raise ValueError('Username must be 3–40 characters and use letters, numbers, dots, underscores or hyphens.')
        if self.college_username and user == self.college_username.lower():
            raise ValueError('That username is reserved for Welingkar.')
        if len(password or '') < 10:
            raise ValueError('Vendor password must be at least 10 characters.')
        record = {'id': uuid.uuid4().hex, 'username': user, 'name': display, 'organisation': org, 'password_hash': hash_password(password), 'created_at': iso(utcnow())}
        try:
            with self.connect() as db:
                db.execute('INSERT INTO vendors (id,username,name,organisation,password_hash,active,created_at) VALUES (?,?,?,?,?,1,?)',
                           (record['id'], record['username'], record['name'], record['organisation'], record['password_hash'], record['created_at']))
        except sqlite3.IntegrityError as exc:
            raise ValueError('That username is already in use.') from exc
        return {k: record[k] for k in ('id', 'username', 'name', 'organisation', 'created_at')}

    def vendors(self):
        with self.connect() as db:
            rows = db.execute('SELECT id,username,name,organisation,active,created_at FROM vendors ORDER BY organisation, name').fetchall()
        return [dict(row) for row in rows]

    def create_submission(self, actor, fields, uploaded):
        if actor['role'] != 'vendor':
            raise ValueError('Only a vendor account can submit a document.')
        kind = (fields.get('kind') or '').strip()
        if kind not in KINDS:
            raise ValueError('Choose invoice, receipt or voucher.')
        number = clean_text(fields.get('documentNumber'), 80, 'Document number')
        if not number:
            raise ValueError('Enter the document number.')
        day = document_day(fields.get('documentDate'))
        unit = (fields.get('unit') or '').strip()
        if unit not in UNITS:
            raise ValueError('Choose a known unit, or leave it blank.')
        note = clean_text(fields.get('note'), 1000, 'Note')
        amount = parse_amount(fields.get('amount'))
        if not uploaded or not uploaded.get('data'):
            raise ValueError('Choose a PDF or image to upload.')
        data = uploaded['data']
        if len(data) > MAX_BYTES:
            raise ValueError('The file must be 10 MB or smaller.')
        mime = sniff(data)
        if not mime:
            raise ValueError('Upload a PDF, PNG, JPEG or WebP file.')
        now = iso(utcnow())
        record_id = uuid.uuid4().hex
        storage_name = record_id + { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[mime]
        (self.files / storage_name).write_bytes(data)
        row = {
            'id': record_id, 'kind': kind, 'vendor_id': actor['id'], 'organisation': actor['organisation'],
            'document_number': number, 'document_date': day, 'amount_paise': amount, 'unit': unit, 'note': note,
            'original_name': clean_text(uploaded.get('filename') or 'document', 180, 'File name') or 'document',
            'mime': mime, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'storage_name': storage_name,
            'status': 'awaiting_vendor', 'vendor_approved_at': None, 'vendor_approved_by': None,
            'college_approved_at': None, 'college_approved_by': None, 'return_note': '', 'created_at': now, 'updated_at': now,
        }
        with self.connect() as db:
            duplicate = db.execute("SELECT id FROM submissions WHERE vendor_id=? AND document_number=? AND status='posted'", (actor['id'], number)).fetchone()
            db.execute('''INSERT INTO submissions
                (id,kind,vendor_id,organisation,document_number,document_date,amount_paise,unit,note,original_name,mime,size,sha256,storage_name,status,vendor_approved_at,vendor_approved_by,college_approved_at,college_approved_by,return_note,created_at,updated_at)
                VALUES (:id,:kind,:vendor_id,:organisation,:document_number,:document_date,:amount_paise,:unit,:note,:original_name,:mime,:size,:sha256,:storage_name,:status,:vendor_approved_at,:vendor_approved_by,:college_approved_at,:college_approved_by,:return_note,:created_at,:updated_at)''', row)
        public = self.public_row(row)
        public['duplicatePosted'] = bool(duplicate)
        return public

    def public_row(self, row):
        data = dict(row)
        return {
            'id': data['id'], 'kind': data['kind'], 'organisation': data['organisation'],
            'documentNumber': data['document_number'], 'documentDate': data['document_date'],
            'amountPaise': data['amount_paise'], 'unit': data['unit'], 'note': data['note'],
            'fileName': data['original_name'], 'mime': data['mime'], 'size': data['size'],
            'status': data['status'], 'vendorApprovedAt': data['vendor_approved_at'], 'vendorApprovedBy': data['vendor_approved_by'],
            'collegeApprovedAt': data['college_approved_at'], 'collegeApprovedBy': data['college_approved_by'],
            'returnNote': data['return_note'], 'createdAt': data['created_at'], 'updatedAt': data['updated_at'],
            'posted': data['status'] == 'posted',
        }

    def visible(self, actor, record_id=None):
        sql = 'SELECT * FROM submissions'
        args = []
        if actor['role'] == 'vendor':
            sql += ' WHERE vendor_id=?'
            args.append(actor['id'])
        if record_id:
            sql += (' AND ' if args else ' WHERE ') + 'id=?'
            args.append(record_id)
        sql += ' ORDER BY created_at DESC'
        with self.connect() as db:
            rows = db.execute(sql, args).fetchall()
        return [self.public_row(row) for row in rows]

    def require_row(self, actor, record_id):
        with self.connect() as db:
            row = db.execute('SELECT * FROM submissions WHERE id=?', (record_id,)).fetchone()
        if not row or (actor['role'] == 'vendor' and row['vendor_id'] != actor['id']):
            raise LookupError('That document is not available.')
        return row

    def vendor_approve(self, actor, record_id):
        row = self.require_row(actor, record_id)
        if actor['role'] != 'vendor' or row['vendor_id'] != actor['id']:
            raise ValueError('The vendor who submitted this document approves it.')
        if row['status'] != 'awaiting_vendor':
            raise ValueError('This document is not waiting for vendor approval.')
        now = iso(utcnow())
        with self.connect() as db:
            db.execute("UPDATE submissions SET status='awaiting_college', vendor_approved_at=?, vendor_approved_by=?, updated_at=? WHERE id=? AND status='awaiting_vendor'",
                       (now, actor['name'], now, record_id))
        return self.visible(actor, record_id)[0]

    def college_approve(self, actor, record_id):
        if actor['role'] != 'college':
            raise ValueError('Welingkar approval is required for this step.')
        row = self.require_row(actor, record_id)
        if row['status'] != 'awaiting_college' or not row['vendor_approved_at']:
            raise ValueError('Welingkar can approve only after the vendor has approved.')
        now = iso(utcnow())
        with self.connect() as db:
            db.execute("UPDATE submissions SET status='posted', college_approved_at=?, college_approved_by=?, updated_at=? WHERE id=? AND status='awaiting_college'",
                       (now, actor['name'], now, record_id))
        return self.visible(actor, record_id)[0]

    def return_submission(self, actor, record_id, note):
        if actor['role'] != 'college':
            raise ValueError('Only Welingkar can return a document.')
        reason = clean_text(note, 1000, 'Return note')
        if not reason:
            raise ValueError('Enter what the vendor should correct.')
        row = self.require_row(actor, record_id)
        if row['status'] not in ('awaiting_vendor', 'awaiting_college'):
            raise ValueError('A posted document stays in the register.')
        now = iso(utcnow())
        with self.connect() as db:
            db.execute("UPDATE submissions SET status='returned', return_note=?, vendor_approved_at=NULL, vendor_approved_by=NULL, updated_at=? WHERE id=? AND status IN ('awaiting_vendor','awaiting_college')",
                       (reason, now, record_id))
        return self.visible(actor, record_id)[0]

    def replace_submission(self, actor, record_id, fields, uploaded):
        row = self.require_row(actor, record_id)
        if actor['role'] != 'vendor' or row['vendor_id'] != actor['id']:
            raise ValueError('The submitting vendor can replace this file.')
        if row['status'] != 'returned':
            raise ValueError('Replace a file only after Welingkar has returned it.')
        if not uploaded or not uploaded.get('data'):
            raise ValueError('Choose a PDF or image to upload.')
        data = uploaded['data']
        if len(data) > MAX_BYTES:
            raise ValueError('The file must be 10 MB or smaller.')
        mime = sniff(data)
        if not mime:
            raise ValueError('Upload a PDF, PNG, JPEG or WebP file.')
        number = clean_text(fields.get('documentNumber') or row['document_number'], 80, 'Document number') or row['document_number']
        day = document_day(fields.get('documentDate') or row['document_date'])
        kind = (fields.get('kind') or row['kind']).strip()
        if kind not in KINDS:
            raise ValueError('Choose invoice, receipt or voucher.')
        unit = (fields.get('unit') if 'unit' in fields else row['unit']).strip()
        if unit not in UNITS:
            raise ValueError('Choose a known unit, or leave it blank.')
        note = clean_text(fields.get('note') if 'note' in fields else row['note'], 1000, 'Note')
        amount = parse_amount(fields.get('amount')) if 'amount' in fields and fields.get('amount') != '' else row['amount_paise']
        storage_name = uuid.uuid4().hex + { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[mime]
        (self.files / storage_name).write_bytes(data)
        old = self.files / row['storage_name']
        now = iso(utcnow())
        with self.connect() as db:
            db.execute('''UPDATE submissions SET kind=?, document_number=?, document_date=?, amount_paise=?, unit=?, note=?, original_name=?, mime=?, size=?, sha256=?, storage_name=?, status='awaiting_vendor', vendor_approved_at=NULL, vendor_approved_by=NULL, return_note='', updated_at=? WHERE id=? AND status='returned' ''',
                       (kind, number, day, amount, unit, note, clean_text(uploaded.get('filename') or 'document', 180, 'File name') or 'document', mime, len(data), hashlib.sha256(data).hexdigest(), storage_name, now, record_id))
        if old.is_file():
            old.unlink()
        return self.visible(actor, record_id)[0]

    def file_for(self, actor, record_id):
        row = self.require_row(actor, record_id)
        path = (self.files / row['storage_name']).resolve()
        if path.parent != self.files.resolve() or not path.is_file():
            raise LookupError('The file is no longer available.')
        return path, row['mime'], row['original_name']

    def register_csv(self, actor):
        if actor['role'] != 'college':
            raise ValueError('The posted register is exported by Welingkar.')
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(['Document number', 'Kind', 'Vendor', 'Document date', 'Amount (paise)', 'Unit', 'Vendor approved at', 'Vendor approved by', 'Welingkar approved at', 'Welingkar approved by', 'File', 'Posted at'])
        for row in self.visible(actor):
            if row['status'] != 'posted':
                continue
            writer.writerow([row['documentNumber'], row['kind'], row['organisation'], row['documentDate'], '' if row['amountPaise'] is None else row['amountPaise'], row['unit'], row['vendorApprovedAt'], row['vendorApprovedBy'], row['collegeApprovedAt'], row['collegeApprovedBy'], row['fileName'], row['updatedAt']])
        return buffer.getvalue()


class IntakeApp:
    def __init__(self, store, public_dir, secret):
        self.store = store
        self.public = Path(public_dir)
        self.secret = secret.encode('utf-8')

    def handle(self, handler):
        parsed = urlparse(handler.path)
        path = parsed.path
        if path not in ('/intake', '/intake/') and not path.startswith('/intake/') and not path.startswith('/api/intake'):
            return False
        try:
            if path.startswith('/api/intake'):
                self.api(handler, path)
            else:
                self.page(handler, path)
        except ValueError as exc:
            self.send_json(handler, 400, {'error': str(exc)})
        except PermissionError as exc:
            self.send_json(handler, 403, {'error': str(exc)})
        except LookupError as exc:
            self.send_json(handler, 404, {'error': str(exc)})
        except json.JSONDecodeError:
            self.send_json(handler, 400, {'error': 'The request could not be read.'})
        except Exception as exc:
            handler.send_error(500, 'The document module could not complete that request.')
            handler.log_error('intake failure: %s', exc)
        return True

    def page(self, handler, path):
        relative = 'index.html' if path in ('/intake', '/intake/') else path[len('/intake/'):]
        if relative not in ('index.html', 'intake.css', 'intake.js'):
            handler.send_error(404, 'Not found.')
            return
        target = (self.public / relative).resolve()
        if target.parent != self.public.resolve() or not target.is_file():
            handler.send_error(404, 'Not found.')
            return
        kind = {'html': 'text/html; charset=utf-8', 'css': 'text/css; charset=utf-8', 'js': 'text/javascript; charset=utf-8'}[target.suffix[1:]]
        body = target.read_bytes()
        handler.send_response(200)
        handler.send_header('Content-Type', kind)
        handler.send_header('Content-Length', str(len(body)))
        handler.end_headers()
        if handler.command != 'HEAD':
            handler.wfile.write(body)

    def api(self, handler, path):
        if handler.command == 'GET' and path == '/api/intake/session':
            actor = self.actor_from(handler)
            self.send_json(handler, 200 if actor else 401, {'authenticated': bool(actor), 'actor': self.public_actor(actor)})
            return
        if handler.command == 'POST' and path == '/api/intake/login':
            body = self.read_json(handler)
            actor = self.store.authenticate(body.get('username'), body.get('password'))
            if not actor:
                self.send_json(handler, 401, {'error': 'Those sign-in details were not recognised.'})
                return
            self.send_json(handler, 200, {'authenticated': True, 'actor': self.public_actor(actor)}, self.cookie(actor))
            return
        if handler.command == 'POST' and path == '/api/intake/logout':
            self.send_json(handler, 200, {'authenticated': False}, self.logged_out_cookie())
            return
        actor = self.actor_from(handler)
        if not actor:
            self.send_json(handler, 401, {'error': 'Sign in to continue.'})
            return
        if handler.command == 'GET' and path == '/api/intake/submissions':
            self.send_json(handler, 200, {'submissions': self.store.visible(actor)})
            return
        if handler.command == 'GET' and path == '/api/intake/vendors':
            self.require_college(actor)
            self.send_json(handler, 200, {'vendors': self.store.vendors()})
            return
        if handler.command == 'POST' and path == '/api/intake/vendors':
            self.require_college(actor)
            created = self.store.add_vendor(**self.vendor_fields(self.read_json(handler)))
            self.send_json(handler, 201, {'vendor': created})
            return
        if handler.command == 'GET' and path == '/api/intake/register.csv':
            self.require_college(actor)
            payload = self.store.register_csv(actor).encode('utf-8')
            handler.send_response(200)
            handler.send_header('Content-Type', 'text/csv; charset=utf-8')
            handler.send_header('Content-Disposition', 'attachment; filename="welingkar-posted-documents.csv"')
            handler.send_header('Content-Length', str(len(payload)))
            handler.end_headers()
            handler.wfile.write(payload)
            return
        if handler.command == 'POST' and path == '/api/intake/submissions':
            fields, uploaded = self.read_upload(handler)
            created = self.store.create_submission(actor, fields, uploaded)
            self.send_json(handler, 201, {'submission': created})
            return
        match = re.fullmatch(r'/api/intake/submissions/([a-f0-9]{32})(?:/(file|vendor-approve|college-approve|return|replace))?', path)
        if not match:
            self.send_json(handler, 404, {'error': 'That document action does not exist.'})
            return
        record_id, action = match.group(1), match.group(2)
        if handler.command == 'GET' and action == 'file':
            target, mime, name = self.store.file_for(actor, record_id)
            payload = target.read_bytes()
            handler.send_response(200)
            handler.send_header('Content-Type', mime)
            handler.send_header('Content-Disposition', f"attachment; filename*=UTF-8''{quote(name)}")
            handler.send_header('Content-Length', str(len(payload)))
            handler.send_header('X-Content-Type-Options', 'nosniff')
            handler.end_headers()
            handler.wfile.write(payload)
            return
        if handler.command != 'POST':
            self.send_json(handler, 405, {'error': 'That action is not available.'})
            return
        if action == 'vendor-approve':
            saved = self.store.vendor_approve(actor, record_id)
        elif action == 'college-approve':
            saved = self.store.college_approve(actor, record_id)
        elif action == 'return':
            saved = self.store.return_submission(actor, record_id, self.read_json(handler).get('note'))
        elif action == 'replace':
            fields, uploaded = self.read_upload(handler)
            saved = self.store.replace_submission(actor, record_id, fields, uploaded)
        else:
            self.send_json(handler, 404, {'error': 'That document action does not exist.'})
            return
        self.send_json(handler, 200, {'submission': saved})

    def vendor_fields(self, body):
        return {'name': body.get('name'), 'organisation': body.get('organisation'), 'username': body.get('username'), 'password': body.get('password')}

    def require_college(self, actor):
        if actor['role'] != 'college':
            raise PermissionError('Welingkar uses this action.')

    def read_json(self, handler):
        length = int(handler.headers.get('Content-Length', '0') or 0)
        if length > 100_000:
            raise ValueError('That request is too large.')
        raw = handler.rfile.read(length) if length else b''
        if not raw:
            return {}
        data = json.loads(raw.decode('utf-8'))
        if not isinstance(data, dict):
            raise ValueError('The request could not be read.')
        return data

    def read_upload(self, handler):
        length = int(handler.headers.get('Content-Length', '0') or 0)
        if length > MAX_BYTES + 100_000:
            raise ValueError('The file must be 10 MB or smaller.')
        return parse_multipart(handler.headers.get('Content-Type', ''), handler.rfile.read(length))

    def actor_from(self, handler):
        raw = self.cookies(handler).get(SESSION_COOKIE, '')
        if raw == 'signed-out':
            return None
        actor = self.read_session(raw)
        if actor:
            return actor
        if self.basic_is_college(handler):
            return self.store.college_actor()
        return None

    def basic_is_college(self, handler):
        header = handler.headers.get('Authorization', '')
        try:
            scheme, encoded = header.split(' ', 1)
            user, secret = base64.b64decode(encoded, validate=True).decode('utf-8').split(':', 1)
        except (ValueError, UnicodeError):
            return False
        college = self.store.college_actor()
        return bool(college) and scheme.lower() == 'basic' and hmac.compare_digest(user, self.store.college_username) and hmac.compare_digest(secret, self.store.college_password)

    def read_session(self, raw):
        try:
            payload, signature = raw.split('.', 1)
            expected = hmac.new(self.secret, payload.encode('ascii'), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected):
                return None
            data = json.loads(base64.urlsafe_b64decode(payload + '=='))
            if datetime.fromisoformat(data['exp']) < utcnow():
                return None
            if data['role'] == 'college':
                return self.store.college_actor()
            with self.store.connect() as db:
                row = db.execute('SELECT * FROM vendors WHERE id=? AND active=1', (data['id'],)).fetchone()
            return self.store.vendor_actor(row) if row else None
        except (ValueError, KeyError, json.JSONDecodeError, UnicodeError):
            return None

    def cookie(self, actor):
        payload = json.dumps({'id': actor['id'], 'role': actor['role'], 'exp': iso(utcnow() + timedelta(hours=SESSION_HOURS))}, separators=(',', ':'))
        encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip('=')
        signature = hmac.new(self.secret, encoded.encode('ascii'), hashlib.sha256).hexdigest()
        return self.cookie_header(f'{encoded}.{signature}')

    def logged_out_cookie(self):
        return self.cookie_header('signed-out')

    def cookie_header(self, value):
        return f'{SESSION_COOKIE}={value}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_HOURS * 3600}'

    def cookies(self, handler):
        found = {}
        for part in handler.headers.get('Cookie', '').split(';'):
            if '=' in part:
                key, value = part.split('=', 1)
                found[key.strip()] = value.strip()
        return found

    def public_actor(self, actor):
        if not actor:
            return None
        return {'role': actor['role'], 'name': actor['name'], 'username': actor['username'], 'organisation': actor['organisation']}

    def send_json(self, handler, status, payload, cookie=None):
        body = json.dumps(payload).encode('utf-8')
        handler.send_response(status)
        handler.send_header('Content-Type', 'application/json; charset=utf-8')
        handler.send_header('Content-Length', str(len(body)))
        if cookie:
            handler.send_header('Set-Cookie', cookie)
        handler.end_headers()
        if handler.command != 'HEAD':
            handler.wfile.write(body)


def build_app(data_dir, college_username, college_password, public_dir):
    secret = os.environ.get('INTAKE_SECRET') or hashlib.sha256(f'{college_username}:{college_password}:welingkar-intake'.encode()).hexdigest()
    return IntakeApp(IntakeStore(data_dir, college_username, college_password), public_dir, secret)
