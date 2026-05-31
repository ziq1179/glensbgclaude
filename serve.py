"""Static dev server for The Glens site.

Serves files from this directory with caching disabled so that edits to
HTML/CSS/JS are always picked up on the next page load (no hard-refresh
needed). Usage: python serve.py [port]   (default port 8123)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
