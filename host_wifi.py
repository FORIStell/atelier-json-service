#!/usr/bin/env python3
"""Host MathBot on your Wi-Fi so phones, tablets and other computers can use it.

    python host_wifi.py            # https (camera works on phones), falls back to http
    python host_wifi.py --http     # plain http (no security warning, but no live camera on phones)
    python host_wifi.py --port 9000

Then open the printed address on any device connected to the same Wi-Fi.
Keep this computer on and this window open while others use it. Ctrl+C stops it.

About https: phones only allow the live camera on secure (https) pages, so this
script makes its own certificate the first time (saved in .wifi-cert/). Because
it isn't from a certificate authority, the phone shows a warning once:
  * iPhone Safari:  "Show Details" -> "visit this website" -> "Visit Website"
  * Android Chrome: "Advanced" -> "Proceed"
Making the certificate needs either the `openssl` command or the Python
package `cryptography` (pip install cryptography). Without them it uses http,
where everything except the live camera works (you can still pick photos).
If other devices can't connect, allow Python through your computer's firewall
when Windows/macOS asks, and make sure both devices are on the same network.
"""
import argparse
import datetime
import ipaddress
import os
import shutil
import subprocess
import sys

from run import lan_ip, make_server, serve

CERT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".wifi-cert")


def make_cert(ip):
    """Create (or reuse) a self-signed certificate for this computer's IP."""
    os.makedirs(CERT_DIR, exist_ok=True)
    cert, key = os.path.join(CERT_DIR, "cert.pem"), os.path.join(CERT_DIR, "key.pem")
    stamp = os.path.join(CERT_DIR, "ip.txt")
    if os.path.exists(cert) and os.path.exists(key) and os.path.exists(stamp) and open(stamp).read().strip() == ip:
        return cert, key
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID

        k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "MathBot")])
        now = datetime.datetime.now(datetime.timezone.utc)
        c = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(k.public_key())
             .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
             .not_valid_after(now + datetime.timedelta(days=825))
             .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address(ip))]), critical=False)
             .sign(k, hashes.SHA256()))
        with open(key, "wb") as f:
            f.write(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
        with open(cert, "wb") as f:
            f.write(c.public_bytes(serialization.Encoding.PEM))
    except ImportError:
        if not shutil.which("openssl"):
            return None
        r = subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
                            "-days", "825", "-subj", "/CN=MathBot", "-addext", f"subjectAltName=DNS:localhost,IP:{ip}"],
                           capture_output=True)
        if r.returncode != 0:
            return None
    with open(stamp, "w") as f:
        f.write(ip)
    return cert, key


def main():
    ap = argparse.ArgumentParser(description="Host MathBot on your Wi-Fi.")
    ap.add_argument("--port", type=int, default=8443)
    ap.add_argument("--http", action="store_true", help="use plain http (no certificate warning, no live phone camera)")
    args = ap.parse_args()

    ip = lan_ip()
    if not ip:
        sys.exit("This computer doesn't seem to be on a network. Connect to Wi-Fi and try again.")
    cert = None if args.http else make_cert(ip)
    if not args.http and not cert:
        print("Couldn't make an https certificate (install it with:  pip install cryptography).")
        print("Using http instead: everything works except the live camera on phones.\n")
    port = args.port if cert or args.port != 8443 else 8000
    httpd, port = make_server("0.0.0.0", port)
    scheme = "https" if cert else "http"
    url = f"{scheme}://{ip}:{port}/"
    print("=" * 56)
    print("  MathBot is on your Wi-Fi!")
    print(f"  Open this on your phone or another computer:\n\n      {url}\n")
    print(f"  On this computer:  {scheme}://localhost:{port}/")
    if cert:
        print("\n  The first time, your phone warns that the site isn't private.")
        print("  That's expected (it's your own computer):")
        print("    iPhone:  Show Details > visit this website > Visit Website")
        print("    Android: Advanced > Proceed")
    print("=" * 56)
    serve(httpd, None, cert)


if __name__ == "__main__":
    main()
