const STATUS = {
  awaiting_vendor: ['Awaiting vendor approval', 'wait'],
  awaiting_college: ['Awaiting Welingkar approval', 'wait'],
  returned: ['Returned to the vendor', 'returned'],
  posted: ['Posted to the register', 'posted'],
};
const KINDS = [['invoice', 'Invoice'], ['receipt', 'Receipt'], ['voucher', 'Voucher']];
const UNITS = ['', 'Autonomous', 'Bengaluru', 'PGDM', 'University'];

const state = { actor: null, submissions: [], vendors: [], tab: 'queue', file: null, preview: '', busy: false, error: '', view: 'queue' };

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value != null && value !== false) node.setAttribute(key, value);
  });
  children.flat().forEach(child => {
    if (child == null || child === false) return;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  });
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (response.status === 204) return {};
  const isJson = (response.headers.get('content-type') || '').includes('json');
  const data = isJson ? await response.json() : {};
  if (!response.ok) throw new Error(data.error || 'That request could not be completed.');
  return data;
}

function money(paise) {
  if (paise == null) return 'Amount not entered';
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return sign + '₹' + Math.trunc(abs / 100).toLocaleString('en-IN') + '.' + String(abs % 100).padStart(2, '0');
}

function when(value) {
  if (!value) return 'Pending';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function kindLabel(kind) {
  return KINDS.find(item => item[0] === kind)?.[1] || kind;
}

async function refresh() {
  const session = await api('/api/intake/session').catch(() => ({ authenticated: false }));
  state.actor = session.authenticated ? session.actor : null;
  if (!state.actor) { state.busy = false; render(); return; }
  const data = await api('/api/intake/submissions');
  state.submissions = data.submissions;
  if (state.actor.role === 'college') state.vendors = (await api('/api/intake/vendors')).vendors;
  state.busy = false;
  render();
}

function setFile(file) {
  if (state.preview) URL.revokeObjectURL(state.preview);
  state.file = file;
  state.preview = file && file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
  state.error = '';
  render();
}

async function submitDocument(event) {
  event.preventDefault();
  if (!state.file) { state.error = 'Choose a PDF or image to upload.'; render(); return; }
  const form = new FormData(event.currentTarget);
  form.set('file', state.file);
  state.busy = true; state.error = ''; render();
  try {
    const saved = await api('/api/intake/submissions', { method: 'POST', body: form });
    setFile(null);
    if (saved.submission.duplicatePosted) state.error = 'This document number is already on the posted register. The new upload still needs both approvals.';
    await refresh();
  } catch (error) {
    state.busy = false; state.error = error.message; render();
  }
}

async function act(path, options) {
  state.busy = true; state.error = ''; render();
  try { await api(path, options); await refresh(); }
  catch (error) { state.busy = false; state.error = error.message; render(); }
}

function uploadCard() {
  return el('form', { class: 'card', onsubmit: submitDocument },
    el('div', {}, el('h2', {}, 'Upload a document'), el('p', { class: 'hint' }, 'PDF, PNG, JPEG or WebP, up to 10 MB.')),
    el('div', { class: 'drop' + (state.file ? ' has-file' : ''), ondragover: event => { event.preventDefault(); event.currentTarget.classList.add('over'); }, ondragleave: event => event.currentTarget.classList.remove('over'), ondrop: event => { event.preventDefault(); event.currentTarget.classList.remove('over'); if (event.dataTransfer.files[0]) setFile(event.dataTransfer.files[0]); } },
      state.preview ? el('img', { src: state.preview, alt: 'Selected document preview' }) : el('strong', {}, 'Start with the document'),
      el('p', { class: 'hint' }, 'Drop an invoice, receipt or voucher here, or choose a file.'),
      state.file ? el('span', { class: 'file-pill' }, state.file.name) : null,
      el('label', { class: 'ghost' }, 'Choose file', el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,application/pdf', hidden: true, onchange: event => { if (event.target.files[0]) setFile(event.target.files[0]); } }))
    ),
    el('div', { class: 'fields' },
      el('label', {}, 'Document type', el('select', { name: 'kind', required: true }, KINDS.map(([value, label]) => el('option', { value }, label)))),
      el('label', {}, 'Document number', el('input', { name: 'documentNumber', required: true, maxlength: '80', autocomplete: 'off' })),
      el('label', {}, 'Document date', el('input', { name: 'documentDate', type: 'date', required: true })),
      el('label', {}, 'Amount on the document', el('input', { name: 'amount', inputmode: 'decimal', placeholder: 'Optional' })),
      el('label', { class: 'wide' }, 'Welingkar unit', el('select', { name: 'unit' }, UNITS.map(unit => el('option', { value: unit }, unit || 'Not specified')))),
      el('label', { class: 'wide' }, 'Note', el('textarea', { name: 'note', maxlength: '1000', placeholder: 'Optional context for the reviewer' }))
    ),
    el('button', { class: 'btn', type: 'submit', disabled: state.busy }, 'Submit for approval')
  );
}

function trail(item) {
  return el('div', { class: 'trail' },
    el('span', {}, el('b', {}, 'Vendor'), item.vendorApprovedAt ? item.vendorApprovedBy + ' · ' + when(item.vendorApprovedAt) : 'Pending'),
    el('span', {}, el('b', {}, 'Welingkar'), item.collegeApprovedAt ? item.collegeApprovedBy + ' · ' + when(item.collegeApprovedAt) : 'Pending')
  );
}

function submissionCard(item) {
  const [label, tone] = STATUS[item.status] || [item.status, ''];
  const vendor = state.actor.role === 'vendor';
  const actions = [
    el('a', { class: 'ghost', href: '/api/intake/submissions/' + item.id + '/file' }, 'Download'),
  ];
  if (vendor && item.status === 'awaiting_vendor') actions.push(el('button', { class: 'btn', type: 'button', disabled: state.busy, onclick: () => act('/api/intake/submissions/' + item.id + '/vendor-approve', { method: 'POST' }) }, 'Vendor approval'));
  if (!vendor && item.status === 'awaiting_college') actions.push(el('button', { class: 'btn', type: 'button', disabled: state.busy, onclick: () => act('/api/intake/submissions/' + item.id + '/college-approve', { method: 'POST' }) }, 'Welingkar approval'));
  if (!vendor && (item.status === 'awaiting_vendor' || item.status === 'awaiting_college')) actions.push(el('button', { class: 'ghost', type: 'button', disabled: state.busy, onclick: () => { const note = window.prompt('What should the vendor correct?'); if (note) act('/api/intake/submissions/' + item.id + '/return', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }); } }, 'Return'));
  return el('article', { class: 'item' },
    el('header', {}, el('div', {}, el('strong', {}, item.organisation), el('div', { class: 'meta' }, el('span', {}, kindLabel(item.kind) + ' ' + item.documentNumber))), el('span', { class: 'badge ' + tone }, label)),
    el('div', { class: 'meta' }, el('span', {}, item.documentDate), el('span', {}, money(item.amountPaise)), item.unit ? el('span', {}, item.unit) : null, el('span', {}, item.fileName)),
    item.note ? el('p', {}, item.note) : null,
    item.returnNote && item.status === 'returned' ? el('p', { class: 'error' }, 'Returned: ' + item.returnNote) : null,
    trail(item),
    vendor && item.status === 'returned' ? replaceForm(item) : null,
    el('div', { class: 'row-actions' }, actions)
  );
}

function replaceForm(item) {
  return el('form', { class: 'fields', onsubmit: event => { event.preventDefault(); const body = new FormData(event.currentTarget); if (!body.get('file') || !body.get('file').name) { state.error = 'Choose the replacement PDF or image.'; render(); return; } act('/api/intake/submissions/' + item.id + '/replace', { method: 'POST', body }); } },
    el('label', { class: 'wide' }, 'Replacement file', el('input', { name: 'file', type: 'file', accept: 'image/png,image/jpeg,image/webp,application/pdf', required: true })),
    el('label', {}, 'Document number', el('input', { name: 'documentNumber', value: item.documentNumber, required: true })),
    el('label', {}, 'Document date', el('input', { name: 'documentDate', type: 'date', value: item.documentDate, required: true })),
    el('label', {}, 'Amount', el('input', { name: 'amount', value: item.amountPaise == null ? '' : (item.amountPaise / 100).toFixed(2) })),
    el('label', {}, 'Unit', el('select', { name: 'unit' }, UNITS.map(unit => el('option', { value: unit, selected: unit === item.unit }, unit || 'Not specified')))),
    el('label', { class: 'wide' }, 'Note', el('textarea', { name: 'note' }, item.note)),
    el('input', { type: 'hidden', name: 'kind', value: item.kind }),
    el('button', { class: 'btn', disabled: state.busy }, 'Replace and resubmit')
  );
}

function vendorPanel() {
  return el('form', { class: 'card', onsubmit: event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget).entries()); act('/api/intake/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(() => event.target.reset()); } },
    el('h2', {}, 'Vendor accounts'),
    el('p', { class: 'hint' }, 'A vendor signs in here, uploads their own documents, and gives the first approval.'),
    el('div', { class: 'fields' },
      el('label', {}, 'Vendor name', el('input', { name: 'organisation', required: true, maxlength: '120' })),
      el('label', {}, 'Contact name', el('input', { name: 'name', required: true, maxlength: '80' })),
      el('label', {}, 'Username', el('input', { name: 'username', required: true, autocomplete: 'off' })),
      el('label', {}, 'Password', el('input', { name: 'password', type: 'password', required: true, minlength: '10', autocomplete: 'new-password' }))
    ),
    el('button', { class: 'btn', disabled: state.busy }, 'Add vendor'),
    state.vendors.length ? el('table', { class: 'vendor-table' }, el('thead', {}, el('tr', {}, ['Vendor', 'Contact', 'Username'].map(label => el('th', {}, label)))), el('tbody', {}, state.vendors.map(vendor => el('tr', {}, el('td', {}, vendor.organisation), el('td', {}, vendor.name), el('td', {}, vendor.username))))) : el('p', { class: 'empty' }, 'No vendor accounts yet.')
  );
}

function listFor(items, empty) {
  return el('section', { class: 'card' }, el('div', { class: 'list' }, items.length ? items.map(submissionCard) : el('p', { class: 'empty' }, empty)));
}

function shell() {
  const college = state.actor.role === 'college';
  const waiting = state.submissions.filter(item => college ? item.status === 'awaiting_college' : item.status !== 'posted');
  const posted = state.submissions.filter(item => item.status === 'posted');
  const panels = {
    queue: listFor(waiting, college ? 'Nothing is waiting for Welingkar approval.' : 'You have no documents in progress.'),
    register: listFor(posted, 'Nothing has been posted yet. A document appears here after both approvals.'),
    vendors: vendorPanel(),
  };
  return el('div', {},
    el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('strong', {}, 'Welingkar purchase analysis'), el('span', {}, college ? 'Welingkar reviewer' : state.actor.organisation)),
      el('div', { class: 'top-actions' }, el('a', { class: 'ghost', href: '/' }, 'Analysis'), el('button', { class: 'ghost', type: 'button', onclick: () => act('/api/intake/logout', { method: 'POST' }) }, 'Sign out'))
    ),
    el('main', { class: 'wrap' },
      el('div', {}, el('h1', {}, 'Vendor documents'), el('p', { class: 'hint' }, 'Invoices, receipts and vouchers enter the register only after the vendor and Welingkar have both approved them.')),
      el('p', { class: 'note' }, 'Submitting a file stores it for review. Posted means both approvals are recorded in this register. It does not mean the amount was reconciled, paid, or booked in the purchase snapshot.'),
      state.error ? el('p', { class: 'error' }, state.error) : null,
      college ? el('div', { class: 'tabs' }, [['queue', 'Approval queue'], ['register', 'Posted register'], ['vendors', 'Vendors']].map(([id, label]) => el('button', { class: 'ghost', type: 'button', 'aria-selected': String(state.view === id), onclick: () => { state.view = id; render(); } }, label))) : null,
      college && state.view === 'register' ? el('a', { class: 'ghost', href: '/api/intake/register.csv' }, 'Download posted register') : null,
      college ? panels[state.view] : el('div', { class: 'layout' }, uploadCard(), listFor(state.submissions, 'Upload a document to start the approval.'))
    )
  );
}

function signIn() {
  return el('form', { class: 'sign-in', onsubmit: async event => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    state.busy = true; state.error = ''; render();
    try { await api('/api/intake/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); state.busy = false; await refresh(); }
    catch (error) { state.busy = false; state.error = error.message; render(); }
  } },
    el('p', { class: 'hint' }, 'Welingkar'),
    el('h1', {}, 'Vendor documents'),
    el('p', {}, 'Vendors upload invoices, receipts and vouchers. Welingkar reviews them after the vendor’s own approval.'),
    state.error ? el('p', { class: 'error' }, state.error) : null,
    el('label', {}, 'Username', el('input', { name: 'username', required: true, autocomplete: 'username' })),
    el('label', {}, 'Password', el('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })),
    el('button', { class: 'btn', disabled: state.busy }, 'Sign in')
  );
}

function render() {
  const app = document.querySelector('#app');
  app.replaceChildren(state.actor ? shell() : signIn());
}

refresh();
