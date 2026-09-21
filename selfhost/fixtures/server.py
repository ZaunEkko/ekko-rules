import json
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# One provider answers Stash with an error page and Mihomo with a node list.
# The gateway is expected to ask a second time as the client its output is
# written for, instead of handing the visitor a 502 that names nothing.
UA_GATED_PATH = "/ua-gated-subscription.txt"
MIHOMO_AGENT = re.compile(r"clash|mihomo|meta", re.IGNORECASE)
GATED_REFUSAL = json.dumps(
    {"message": "遇到了些问题，我们正在进行处理"}, ensure_ascii=False
).encode("utf-8")


class FixtureHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        user_agent = self.headers.get("User-Agent", "")
        download = "2048" if user_agent == "clash-verge-rev/e2e" else "1024"
        self.send_header(
            "Subscription-Userinfo",
            f"upload=512; download={download}; total=10737418240; expire=1798761600",
        )
        super().end_headers()

    def do_GET(self):
        if self.path != UA_GATED_PATH:
            super().do_GET()
            return
        if not MIHOMO_AGENT.search(self.headers.get("User-Agent", "")):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(GATED_REFUSAL)))
            self.end_headers()
            self.wfile.write(GATED_REFUSAL)
            return
        with open("status-banner-subscription.txt", "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(("0.0.0.0", 8080), FixtureHandler).serve_forever()
