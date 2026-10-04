# Local test server with correct MIME types (Windows often serves .mjs/.wasm wrongly)
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
    }


if __name__ == "__main__":
    print("Open http://localhost:8000/")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
