#!/usr/bin/env python3
"""Tiny dev server for the subway-mosaic site.

Serves the static files and accepts POST /stats so the page can report
its own frame rate (handy for checking performance on a real GPU).

    python3 serve.py [port]
"""
import sys
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        if self.path.startswith("/stats"):
            print(f"[stats] {body.decode('utf-8', 'replace')}", flush=True)
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        self.send_error(404)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"subway-mosaic → http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
