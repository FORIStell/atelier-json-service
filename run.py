#!/usr/bin/env python3
"""Run MathBot on your computer.

    python run.py            # opens http://localhost:8000 in your browser
    python run.py --port 9000
    python run.py --lan      # also reachable from your phone on the same Wi-Fi

Needs only Python 3 (no installs). Press Ctrl+C to stop.
Note: phones only allow the camera on https sites, so over --lan the
calculator and drawing work but the camera needs the GitHub Pages link.
"""
import argparse
import http.server
import mimetypes
import os
import socket
import socketserver
import sys
import threading
import webbrowser

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

# make sure browsers get the right file types (some systems are missing these)
for ext, kind in {
    ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".bin": "application/octet-stream",
    ".svg": "image/svg+xml", ".png": "image/png",
}.items():
    mimetypes.add_type(kind, ext)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console quiet
        pass


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser(description="Run the MathBot web app locally.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--lan", action="store_true", help="allow other devices on your network to open it")
    ap.add_argument("--no-browser", action="store_true", help="don't open the browser automatically")
    args = ap.parse_args()

    if not os.path.isfile(os.path.join(WEB_DIR, "index.html")):
        sys.exit(f"Can't find the app in {WEB_DIR}. Run this file from the project folder.")

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    socketserver.TCPServer.allow_reuse_address = True
    port = args.port
    for _ in range(20):  # find a free port
        try:
            httpd = socketserver.ThreadingTCPServer((host, port), Handler)
            break
        except OSError:
            port += 1
    else:
        sys.exit("No free port found.")

    url = f"http://localhost:{port}/"
    print(f"MathBot is running:  {url}")
    if args.lan and (ip := lan_ip()):
        print(f"On your phone (same Wi-Fi): http://{ip}:{port}/")
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
