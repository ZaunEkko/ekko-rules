from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class FixtureHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        user_agent = self.headers.get("User-Agent", "")
        download = "2048" if user_agent == "clash-verge-rev/e2e" else "1024"
        self.send_header(
            "Subscription-Userinfo",
            f"upload=512; download={download}; total=10737418240; expire=1798761600",
        )
        super().end_headers()


ThreadingHTTPServer(("0.0.0.0", 8080), FixtureHandler).serve_forever()
