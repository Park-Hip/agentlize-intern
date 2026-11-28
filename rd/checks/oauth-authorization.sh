#!/usr/bin/env bash
# Recheck public sources and the installed SDK used by oauth-authorization.md.
# This checks source assertions, not runtime OAuth conformance.
set -euo pipefail
cd "$(dirname "$0")/../.."
python - <<'PY'
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen

sys.stdout.reconfigure(encoding="utf-8")


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def normalize(body):
    if "<html" in body[:2000].lower():
        parser = VisibleText()
        parser.feed(body)
        body = " ".join(parser.parts)
    return re.sub(r"\s+", " ", unescape(body).replace("*", "")).strip()


checks = [
    ("MCP pinned: PKCE, discovery and client registration",
     "https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization",
     ["MCP clients MUST implement PKCE", "OAuth 2.0 Protected Resource Metadata", "resource",
      "Authorization servers and MCP clients SHOULD support OAuth Client ID Metadata Documents",
      "Authorization servers and MCP clients MAY support the OAuth 2.0 Dynamic Client Registration",
      "Use pre-registered client information", "/.well-known/oauth-authorization-server",
      "/.well-known/openid-configuration"]),
    ("RFC 6749: refresh issuance is optional",
     "https://www.rfc-editor.org/rfc/rfc6749.txt",
     ["Issuing a refresh token is optional"]),
    ("RFC 9207: issuer response validation",
     "https://www.rfc-editor.org/rfc/rfc9207.txt",
     ["This comparison MUST use simple string comparison"]),
    ("RFC 8252: native loopback redirect exception",
     "https://www.rfc-editor.org/rfc/rfc8252.txt",
     ["Loopback Interface Redirection", "http://127.0.0.1"]),
    ("RFC 7009: revocation",
     "https://www.rfc-editor.org/rfc/rfc7009.txt",
     ["Token Revocation", "token_type_hint"]),
    ("RFC 9700: refresh issuance risk assessment",
     "https://www.rfc-editor.org/rfc/rfc9700.txt",
     ["whether to issue refresh tokens to a certain client"]),
    ("SDK pinned: router advertises refresh",
     "https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/1.32.2/src/server/auth/router.ts",
     ["grant_types_supported", "authorization_code", "refresh_token"]),
    ("SDK current: frozen authorization-server helpers",
     "https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/authorization.md",
     ["frozen", "server-legacy/auth"]),
    ("node-oauth pinned: PKCE client-authentication branch",
     "https://raw.githubusercontent.com/node-oauth/node-oauth2-server/v5.3.1/lib/handlers/token-handler.js",
     ["code_verifier", "getClient"]),
    ("node-oauth pinned: consume and persist hooks",
     "https://raw.githubusercontent.com/node-oauth/node-oauth2-server/v5.3.1/lib/grant-types/authorization-code-grant-type.js",
     ["revokeAuthorizationCode", "saveToken", "verifyPKCE"]),
    ("oidc-provider pinned: adapter contract",
     "https://raw.githubusercontent.com/panva/node-oidc-provider/v9.15.1/example/my_adapter.js",
     ["async consume", "atomic", "revokeByGrantId"]),
    ("oidc-provider pinned: opaque token equals jti",
     "https://raw.githubusercontent.com/panva/node-oidc-provider/v9.15.1/lib/models/formats/opaque.js",
     ["value: token.jti"]),
    ("oidc-provider pinned: payload preserves jti",
     "https://raw.githubusercontent.com/panva/node-oidc-provider/v9.15.1/lib/models/base_model.js",
     ["jti", "IN_PAYLOAD", "upsert"]),
    ("oidc-provider pinned: resource and refresh policy hooks",
     "https://raw.githubusercontent.com/panva/node-oidc-provider/v9.15.1/lib/helpers/defaults.js",
     ["issueRefreshToken", "resourceIndicators", "getResourceServerInfo", "pkce"]),
]


def check_source(item):
    label, url, terms = item
    try:
        req = Request(url, headers={"User-Agent": "Lab-source-check/1.0"})
        with urlopen(req, timeout=30) as response:
            body = normalize(response.read().decode("utf-8"))
        missing = [term for term in terms if term.casefold() not in body.casefold()]
        if missing:
            return False, f"MISS | {label} | missing {missing!r} | {url}"
        return True, f"PASS | {label}"
    except Exception as error:
        return False, f"BLOCKED | {label} | {type(error).__name__}: {error} | {url}"


results = []
sdk = Path("lab/node_modules/@modelcontextprotocol/sdk")
try:
    version = json.loads((sdk / "package.json").read_text(encoding="utf-8"))["version"]
    types = (sdk / "dist/esm/types.js").read_text(encoding="utf-8")
    ok = version == "1.32.2" and bool(re.search(
        r"LATEST_PROTOCOL_VERSION\s*=\s*['\"]2025-11-25['\"]", types))
    results.append((ok, f"{'PASS' if ok else 'MISS'} | installed SDK {version}, expected 1.32.2 / 2025-11-25"))
except (OSError, KeyError, ValueError) as error:
    results.append((False, f"BLOCKED | installed SDK | run npm install in lab first | {error}"))

with ThreadPoolExecutor(max_workers=6) as pool:
    results.extend(pool.map(check_source, checks))
for ok, message in results:
    print(message)
failures = sum(not ok for ok, _ in results)
print(f"{len(results) - failures} passed, {failures} failed; source checks only")
raise SystemExit(bool(failures))
PY
