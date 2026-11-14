#!/usr/bin/env python3
"""Serve the built purchase-analysis portal using only Python's standard library."""
import argparse
import base64
import hmac
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from intake import build_app

ROOT=Path(__file__).resolve().parent/'public'

def make_handler(directory,username,password,intake):
    class PortalHandler(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):
            super().__init__(*args,directory=str(directory),**kwargs)
        def authorised(self):
            if not username:return True
            header=self.headers.get('Authorization','')
            try:
                scheme,encoded=header.split(' ',1)
                user,secret=base64.b64decode(encoded,validate=True).decode('utf-8').split(':',1)
                ok=scheme.lower()=='basic' and hmac.compare_digest(user.encode(),username.encode()) and hmac.compare_digest(secret.encode(),password.encode())
            except (ValueError,UnicodeError):ok=False
            if ok:return True
            self.send_response(401)
            self.send_header('WWW-Authenticate','Basic realm="Welingkar analysis", charset="UTF-8"')
            self.send_header('Content-Length','0');self.end_headers();return False
        def do_GET(self):
            if intake.handle(self):return
            if self.authorised():super().do_GET()
        def do_POST(self):
            if intake.handle(self):return
            self.send_error(405,'This page does not accept uploads.')
        def do_HEAD(self):
            if intake.handle(self):return
            if self.authorised():super().do_HEAD()
        def list_directory(self,path):
            self.send_error(404,'Directory listing is disabled');return None
        def end_headers(self):
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Cache-Control','no-store')
            super().end_headers()
    return PortalHandler

def main():
    parser=argparse.ArgumentParser(description='Run the self-hosted purchase-analysis portal')
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8080)
    args=parser.parse_args()
    username=os.environ.get('PORTAL_USERNAME','');password=os.environ.get('PORTAL_PASSWORD','')
    if bool(username)!=bool(password):parser.error('Set both PORTAL_USERNAME and PORTAL_PASSWORD, or neither.')
    if ':' in username:parser.error('PORTAL_USERNAME cannot contain a colon.')
    if args.host not in ['127.0.0.1','localhost','::1'] and not (username and password):
        parser.error('Set PORTAL_USERNAME and PORTAL_PASSWORD before listening beyond localhost.')
    if not (ROOT/'index.html').is_file():parser.error('public/index.html is missing; extract the complete ZIP.')
    data_dir=Path(os.environ.get('DATA_DIR',Path(__file__).resolve().parent/'data'))
    intake=build_app(data_dir,username,password,ROOT/'intake')
    server=ThreadingHTTPServer((args.host,args.port),make_handler(ROOT,username,password,intake))
    print(f'Portal running at http://{args.host}:{args.port}/',flush=True)
    print('Authentication enabled.' if username else 'Localhost-only session.',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
