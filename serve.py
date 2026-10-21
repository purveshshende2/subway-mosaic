#!/usr/bin/env python3
"""Tiny dev server for the subway-mosaic site.

Serves the static files and accepts POST /stats so the page can report
its own frame rate (handy for checking performance on a real GPU), and
POST /frame so the recorder in js/capture.js can drop its frames on disk.

    python3 serve.py [port]

Then, to record a demo:

    rm -rf media/frames && mkdir -p media/frames
    open "http://localhost:8777/?export=1"
    ffmpeg -framerate 30 -i media/frames/%04d.jpg -c:v libx264 ... media/demo.mp4
"""
import sys
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
ROOT = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(ROOT, "media", "frames")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        if self.path.startswith("/stats"):
            print(f"[stats] {body.decode('utf-8', 'replace')}", flush=True)
        elif self.path.startswith("/frame"):
            os.makedirs(FRAMES, exist_ok=True)
            n = len(os.listdir(FRAMES))
            with open(os.path.join(FRAMES, f"{n:04d}.jpg"), "wb") as f:
                f.write(body)
            print(f"[frame] {n + 1}", flush=True)
        else:
            self.send_error(404)
            return

        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"subway-mosaic → http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
