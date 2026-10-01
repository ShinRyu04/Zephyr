"""Fixture for verify22: a python target the debugger can launch."""
import http.server
import socketserver

PORT = 8178


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"uji22\n")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("uji22 listening on %d" % PORT, flush=True)
        httpd.serve_forever()
