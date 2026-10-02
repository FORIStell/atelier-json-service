#!/usr/bin/env python3
"""Run MathBot on your computer.

    python run.py            # opens http://localhost:8000 in your browser
    python run.py --port 9000
    python run.py --lan      # also reachable from your phone on the same Wi-Fi

Needs only Python 3 (no installs). Press Ctrl+C to stop.
Don't open web/index.html by double-clicking it: browsers block the app's
code on file:// pages, so nothing would respond. Always use this script.
To host it for other devices on your Wi-Fi, use host_wifi.py.
"""
import argparse
import http.server
import mimetypes
import os
import socket
import socketserver
import ssl
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
    """This computer's address on the local network (e.g. 192.168.1.23)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no data is sent
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def make_server(host, port):
    if not os.path.isfile(os.path.join(WEB_DIR, "index.html")):
        sys.exit(f"Can't find the app in {WEB_DIR}. Keep this file in the project folder.")
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    for p in range(port, port + 20):  # find a free port
        try:
            return socketserver.ThreadingTCPServer((host, p), Handler), p
        except OSError:
            continue
    sys.exit("No free port found.")


def serve(httpd, open_url=None, cert=None):
    if cert:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(*cert)
        # handshake in the worker thread, so one slow or failed phone connection never blocks the others
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True, do_handshake_on_connect=False)
    if open_url:
        threading.Timer(0.8, lambda: webbrowser.open(open_url)).start()
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


def main():
    ap = argparse.ArgumentParser(description="Run the MathBot web app locally.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--lan", action="store_true", help="allow other devices on your network to open it")
    ap.add_argument("--no-browser", action="store_true", help="don't open the browser automatically")
    args = ap.parse_args()

    httpd, port = make_server("0.0.0.0" if args.lan else "127.0.0.1", args.port)
    url = f"http://localhost:{port}/"
    print(f"MathBot is running:  {url}")
    if args.lan and (ip := lan_ip()):
        print(f"On your phone (same Wi-Fi): http://{ip}:{port}/")
    serve(httpd, None if args.no_browser else url)


if __name__ == "__main__":
    main()
