#!/usr/bin/env python3
"""End-to-end smoke test of a running Kinetix stack, through the public edge only.

    python3 scripts/smoke.py http://localhost:3000            # full, needs internet
    python3 scripts/smoke.py http://localhost:3000 --offline  # skip live OSV/security.txt

It signs up, creates an authorized project, adds a real public repository, waits for the
worker to fetch and scan it, and checks the security properties a deployment must keep.
Standard library only, so it runs anywhere Python does.
"""

import argparse
import http.cookiejar
import json
import secrets
import sys
import time
import urllib.error
import urllib.request

REPO = "https://github.com/OWASP/NodeGoat"
REPO_COMMIT = "c5cb68a7084e4ae7dcc60e6a98768720a81841e8"


class Client:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def csrf(self) -> str:
        for c in self.jar:
            if c.name == "kx_csrf":
                return c.value
        self.request("GET", "/api/v1/auth/csrf")
        return self.csrf()

    def request(self, method: str, path: str, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        h = {"content-type": "application/json", **(headers or {})}
        if method in {"POST", "PATCH", "DELETE"} and "X-CSRF-Token" not in h:
            h["X-CSRF-Token"] = self.csrf()
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with self.opener.open(req, timeout=60) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw and r.headers.get_content_type() == "application/json" else raw), r.headers
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                payload = json.loads(raw)
            except ValueError:
                payload = raw
            return e.code, payload, e.headers


passed: list[str] = []


def check(name: str, ok: bool, detail: object = "") -> None:
    if not ok:
        print(f"FAIL  {name}  {detail}")
        sys.exit(1)
    passed.append(name)
    print(f"ok    {name}")


def wait_for(fn, what: str, timeout: float = 600, every: float = 3):
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(every)
    check(what, False, "timed out")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--offline", action="store_true", help="skip checks that need the internet")
    ap.add_argument("--api-direct", help="URL where the API must NOT be reachable, e.g. http://localhost:8000")
    args = ap.parse_args()
    c = Client(args.base)

    status, body, _ = c.request("GET", "/api/health")
    check("API healthy through the edge", status == 200 and body == {"status": "ok"}, body)

    status, _, headers = c.request("GET", "/login")
    csp = headers.get("content-security-policy", "")
    check("web serves a nonce CSP", status == 200 and "'nonce-" in csp and "'strict-dynamic'" in csp, csp)
    check("edge hides server banners", "Server" not in headers or "caddy" not in headers["Server"].lower(), headers.get("Server"))

    status, _, _ = c.request("GET", "/api/openapi.json")
    print(f"info  OpenAPI schema status {status} (404 expected in production)")

    if args.api_direct:
        try:
            urllib.request.urlopen(args.api_direct + "/api/health", timeout=3)
            reachable = True
        except Exception:
            reachable = False
        check("API is not reachable except through the edge", not reachable)

    demo = Client(args.base)
    status, body, _ = demo.request(
        "POST", "/api/v1/auth/login", {"email": "demo@kinetix.dev", "password": "kinetix-demo-2026"}
    )
    check("seeded demo account signs in", status == 200, body)

    email = f"smoke-{secrets.token_hex(4)}@example.com"
    status, body, _ = c.request(
        "POST",
        "/api/v1/auth/register",
        {"email": email, "name": "Smoke Test", "password": "smoke-test-passphrase-1", "organization_name": "Smoke lab"},
    )
    check("registration", status == 201, body)
    org = body["organizations"][0]["slug"]

    status, sessions, _ = c.request("GET", "/api/v1/auth/sessions")
    ip = next(s["ip_address"] for s in sessions if s["current"])
    spoof = Client(args.base)
    spoof.request(
        "POST", "/api/v1/auth/login", {"email": email, "password": "smoke-test-passphrase-1"},
        headers={"X-Forwarded-For": "6.6.6.6"},
    )
    _, spoof_sessions, _ = spoof.request("GET", "/api/v1/auth/sessions")
    spoof_ip = next(s["ip_address"] for s in spoof_sessions if s["current"])
    check("client address can't be spoofed with X-Forwarded-For", spoof_ip != "6.6.6.6" and spoof_ip == ip, (ip, spoof_ip))

    status, body, _ = c.request(
        "POST",
        f"/api/v1/orgs/{org}/projects",
        {
            "slug": "nodegoat",
            "name": "OWASP NodeGoat",
            "authorization_type": "open_source",
            "in_scope": "Public source repository OWASP/NodeGoat",
            "out_of_scope": "Any hosted deployment",
            "attest": True,
        },
    )
    check("authorized project created", status == 201, body)
    base = f"/api/v1/orgs/{org}/projects/nodegoat"

    status, body, _ = c.request("POST", f"{base}/targets/git", {"url": REPO, "ref": REPO_COMMIT})
    check("repository target accepted", status == 202 and body["fetch_status"] == "pending", body)

    def fetched():
        _, targets, _ = c.request("GET", f"{base}/targets")
        t = targets[0]
        return t if t["fetch_status"] != "pending" else None

    target = wait_for(fetched, "worker fetched the repository", timeout=300)
    check("worker fetched the pinned commit", target["fetch_status"] == "ready" and target["commit"] == REPO_COMMIT, target)

    def scanned():
        _, scans, _ = c.request("GET", f"{base}/scans")
        return scans[0] if scans and scans[0]["status"] in {"succeeded", "failed"} else None

    scan = wait_for(scanned, "worker scanned the repository", timeout=900)
    check("scan finished", scan["status"] == "succeeded", scan)
    stats = scan["stats"]
    check("secrets analyzer ran", "error" not in stats.get("secrets", {"error": "missing"}), stats.get("secrets"))
    sast = stats.get("sast", {})
    check("Semgrep ran in the worker", "error" not in sast and not sast.get("skipped"), sast)
    if not args.offline:
        deps = stats.get("dependencies", {})
        check("live OSV lookup matched dependencies", deps.get("packages", 0) > 0 and "error" not in deps, deps)
        _, findings, _ = c.request("GET", f"{base}/findings?limit=200")
        sources = {f["source"] for f in (findings["items"] if isinstance(findings, dict) else findings)}
        check("dependency findings created from live advisories", "dependency" in sources, sources)

        status, body, _ = c.request("POST", f"/api/v1/orgs/{org}/security-txt", {"domain": "github.com"})
        check("live security.txt lookup", status == 200 and body.get("contacts"), body)

    status, body, _ = c.request("GET", f"/api/v1/orgs/{org}/audit/verify")
    check("chain of custody verifies", status == 200 and body.get("verified") is True, body)

    other = Client(args.base)
    other.request(
        "POST", "/api/v1/auth/register",
        {"email": f"other-{secrets.token_hex(4)}@example.com", "name": "Other", "password": "other-passphrase-123", "organization_name": "Other lab"},
    )
    status, _, _ = other.request("GET", f"{base}/findings")
    check("another workspace can't see this one", status == 404, status)

    codes = []
    attacker = Client(args.base)
    for _ in range(12):
        status, _, _ = attacker.request("POST", "/api/v1/auth/login", {"email": email, "password": "wrong-password-0000"})
        codes.append(status)
    check("login attempts are rate limited", 429 in codes, codes)

    print(f"\n{len(passed)} checks passed.")


if __name__ == "__main__":
    main()
