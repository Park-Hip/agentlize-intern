#!/usr/bin/env bash
# Recheck the public sources quoted by rd/research/oauth-client-compatibility.md.
# Every quote is pinned to a tag of the OpenMausBot repository, so it does not drift.
# This checks source wording, not a sign-in: the behavioural probes live in
# scratch/oauth-client-compatibility/ (git-ignored) and need the installed build.
set -euo pipefail
cd "$(dirname "$0")/../.."
python - <<'PY'
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from html.parser import HTMLParser
import re
import sys
from urllib.request import Request, urlopen

sys.stdout.reconfigure(encoding="utf-8")

V184 = "https://raw.githubusercontent.com/milind-soni/OpenMausBot/v0.1.184"
V186 = "https://raw.githubusercontent.com/milind-soni/OpenMausBot/v0.1.186"


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
    body = unescape(body).replace("*", "")
    return re.sub(r"\s+", " ", body).strip()


# (label, url, [exact quotes that must appear])
checks = [
    ("docs v0.1.184: dynamic registration per sign-in",
     f"{V184}/docs/custom-mcp-servers.md",
     ["If it lets apps register themselves (dynamic client registration), "
      "OpenMausBot registers a fresh app for each sign-in."]),
    ("docs v0.1.184: pre-registered app path",
     f"{V184}/docs/custom-mcp-servers.md",
     ["If it only accepts an app registered in advance, add that app as described below."]),
    ("docs v0.1.184: sign-in app fields",
     f"{V184}/docs/custom-mcp-servers.md",
     ["With a client ID set, OpenMausBot signs in as that app and never registers one.",
      "Client secret, only for a confidential app."]),
    ("docs v0.1.184: redirect URI to register",
     f"{V184}/docs/custom-mcp-servers.md",
     ["the editor shows the redirect URI to register with the app:",
      "http://127.0.0.1:<port>/mcp-oauth/callback"]),
    ("docs v0.1.184: token storage and bot rule",
     f"{V184}/docs/custom-mcp-servers.md",
     ["Tokens are kept apart.",
      "A server that needs sign-in is left out of every turn until someone signs in from this page."]),
    ("docs v0.1.184: discovery order",
     f"{V184}/docs/custom-mcp-servers.md",
     ["RFC 9728 protected-resource metadata"]),
    ("client v0.1.184: asks to be a public app",
     f"{V184}/server/mcp-oauth.ts",
     ['token_endpoint_auth_method: "none",',
      'grant_types: ["authorization_code", "refresh_token"],',
      "A fresh client per sign-in: authorization servers prune idle clients, so a cached id goes stale."]),
    ("client v0.1.184: loopback callback path and port",
     f"{V184}/server/mcp-oauth.ts",
     ['export const MCP_OAUTH_CALLBACK_PATH = "/mcp-oauth/callback";',
      "return `http://127.0.0.1:${preferredPort(url)}${CALLBACK_PATH}`;"]),
    ("client v0.1.184: pre-registered app required without DCR",
     f"{V184}/server/mcp-oauth.ts",
     ["This server only signs in apps registered with it in advance."]),
    ("client v0.1.184: PKCE S256 and no redirects when discovering",
     f"{V184}/server/mcp-oauth-discovery.ts",
     ['if (!stringList(metadata.code_challenge_methods_supported)?.includes("S256")) return null;',
      'redirect: "error"']),
    ("client v0.1.184: token store keyed by server name",
     f"{V184}/server/mcp-oauth-store.ts",
     ["servers: z.record(z.string(), recordSchema).default({}),"]),
    ("client v0.1.184: per-person manager on a team server",
     f"{V184}/server/team-connections.ts",
     ["a manager of their own, so flows and tokens never meet another person's."]),
    ("client v0.1.186: CIMD detected but not supported",
     f"{V186}/server/mcp-oauth-discovery.ts",
     ["metadata.client_id_metadata_document_supported === true"]),
    ("client v0.1.186: the refusal names the gap",
     f"{V186}/server/mcp-oauth.ts",
     ["which OpenMausBot doesn't support yet."]),
]


def check(item):
    label, url, quotes = item
    try:
        req = Request(url, headers={"User-Agent": "Lab-source-check/1.0"})
        with urlopen(req, timeout=45) as response:
            body = normalize(response.read().decode("utf-8"))
        missing = [q for q in quotes if q not in body]
        if missing:
            return False, f"MISS | {label} | missing {missing!r} | {url}"
        return True, f"PASS | {label}"
    except Exception as error:
        return False, f"BLOCKED | {label} | {type(error).__name__}: {error} | {url}"


with ThreadPoolExecutor(max_workers=5) as pool:
    results = list(pool.map(check, checks))

for _, message in results:
    print(message)
failures = sum(not ok for ok, _ in results)
print(f"{len(results) - failures} passed, {failures} failed; source checks only")
raise SystemExit(bool(failures))
PY
