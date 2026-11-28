import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionsOf, connectionsPage, CONNECTIONS_PATH, CONNECTIONS_REVOKE_PATH, shortGrantId, SHORT_GRANT_ID_LENGTH, type ConnectionSource } from './connections.js';

const NOW = new Date('2026-11-28T10:00:00.000Z');

interface StoredGrant {
  readonly grantId: string;
  readonly employeeId: string;
  readonly clientId: string;
  readonly scope: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

function source(grants: readonly StoredGrant[], disabled = new Set<string>()): ConnectionSource {
  return {
    clients: [
      { clientId: 'lab-demo-a', clientName: 'Lab demo client A' },
      { clientId: 'lab-demo-b', clientName: 'Lab demo client B' },
    ],
    listByEmployee: (employeeId) => grants.filter((entry) => entry.employeeId === employeeId),
    revoke: () => true,
    isClientDisabled: (clientId) => disabled.has(clientId),
  };
}

function grant(overrides: Partial<StoredGrant> = {}): StoredGrant {
  return {
    grantId: 'grant-hoa',
    employeeId: 'NV-02',
    clientId: 'lab-demo-a',
    scope: 'openid mcp:read mcp:propose',
    createdAt: '2026-11-28T09:00:00.000Z',
    expiresAt: '2026-11-28T13:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

test('oauth connections page: only the signed-in person grants are read, and the client is named by its registration', () => {
  const view = connectionsOf(source([grant()]), 'NV-02', NOW);
  assert.equal(view.length, 1);
  assert.equal(view[0]?.clientName, 'Lab demo client A', 'the name comes from the registration, not the grant row');
  assert.deepEqual(view[0]?.scopes, ['openid', 'mcp:read', 'mcp:propose'], 'scopes are ordered and de-duplicated');
  assert.equal(view[0]?.status, 'active');

  // Another person sees none of these grants.
  assert.deepEqual(connectionsOf(source([grant()]), 'NV-05', NOW), []);
});

test('oauth connections page: a grant is listed once and its status separates revoked, expired and a disabled client', () => {
  const grants = [
    grant({ grantId: 'grant-active' }),
    grant({ grantId: 'grant-revoked', revokedAt: '2026-11-28T09:30:00.000Z' }),
    grant({ grantId: 'grant-expired', expiresAt: '2026-11-28T09:59:00.000Z' }),
    grant({ grantId: 'grant-seller', clientId: 'lab-demo-b' }),
  ];
  const view = connectionsOf(source(grants, new Set(['lab-demo-b'])), 'NV-02', NOW);
  const status = Object.fromEntries(view.map((entry) => [entry.grantId, entry.status]));
  assert.deepEqual(status, {
    'grant-active': 'active',
    'grant-revoked': 'revoked',
    'grant-expired': 'expired',
    'grant-seller': 'disabled',
  });
});

test('oauth connections page: a button shows only for a live grant, and the page never carries an OAuth token or secret', () => {
  const html = connectionsPage({
    viewerLabel: 'Nguyễn Thị Hoa (NV-02)',
    connections: connectionsOf(source([grant(), grant({ grantId: 'grant-revoked', revokedAt: '2026-11-28T09:30:00.000Z' })]), 'NV-02', NOW),
    csrfToken: 'csrf-token-value',
  });
  assert.match(html, /Kết nối ứng dụng/);
  assert.match(html, /Nguyễn Thị Hoa \(NV-02\)/, 'the person is Full Name (NV-xx)');
  assert.match(html, /mcp:read/, 'the scope code stays visible next to its word');
  assert.match(html, /Đọc dữ liệu/, 'the scope words come from the shared label table');
  // One disconnect form, for the live grant only.
  assert.equal(html.match(/Ngắt kết nối<\/button>/g)?.length, 1, 'only the live grant has a button');
  assert.match(html, /\/ket-noi\/grant-hoa\/ngat/);
  assert.ok(!html.includes('/ket-noi/grant-revoked/ngat'), 'a revoked grant has no button');
  assert.match(html, /name="csrf" value="csrf-token-value"/);
  assert.doesNotMatch(html, /access_token|code_verifier|client_secret|trang_|lab_/, 'no token, code, secret or password is on the page');
});

test('oauth connections page: an empty list says so in words rather than showing an empty table', () => {
  const html = connectionsPage({ viewerLabel: 'Lê Hoàng Nam (NV-05)', connections: [], csrfToken: 'csrf' });
  assert.match(html, /Bạn chưa kết nối ứng dụng nào/);
  assert.doesNotMatch(html, /<table/, 'an empty list renders no table');
});

test('oauth connections page: the two addresses are the list and a grant press, and nothing else', () => {
  assert.equal(CONNECTIONS_PATH, '/ket-noi');
  assert.match('/ket-noi/grant-x/ngat', CONNECTIONS_REVOKE_PATH);
  assert.equal(CONNECTIONS_REVOKE_PATH.test('/ket-noi'), false);
  assert.equal(CONNECTIONS_REVOKE_PATH.test('/ket-noi/grant-x'), false);
});

test('oauth connections page: a short grant id stays on one line and the full id is only in the title', () => {
  const grantId = 'XdxAbuqEwH3QgzSrPvD2-FAitAk_ceeDtVwi5VUTsZl';
  assert.equal(shortGrantId(grantId), 'XdxAbuqE…');
  assert.equal(SHORT_GRANT_ID_LENGTH, 8);
  assert.equal(shortGrantId('short'), 'short', 'a short id is shown whole');

  const html = connectionsPage({
    viewerLabel: 'Nguyễn Thị Hoa (NV-02)',
    connections: connectionsOf(source([grant({ grantId })]), 'NV-02', NOW),
    csrfToken: 'csrf',
  });
  assert.match(html, /<span class="meta nowrap" title="XdxAbuqEwH3QgzSrPvD2-FAitAk_ceeDtVwi5VUTsZl"><code>XdxAbuqE…<\/code><\/span>/);
  assert.ok(!/<td data-label="Ứng dụng">[^<]*<br><span[^>]*><code>XdxAbuqEwH3/.test(html), 'the body never shows the whole id');
  // The button posts to the whole id, percent-encoded.
  assert.match(html, /action="\/ket-noi\/XdxAbuqEwH3QgzSrPvD2-FAitAk_ceeDtVwi5VUTsZl\/ngat"/);
});

test('oauth connections page: every interpolated value is escaped, and the form action encodes the grant id', () => {
  // A grant id and a client name carrying markup, as a hostile store or a
  // misconfigured registration could hold them.
  const hostileId = 'grant"<script>alert(1)</script>/../x';
  const html = connectionsPage({
    viewerLabel: 'Hoa <img src=x onerror=alert(1)> (NV-02)',
    connections: [
      {
        grantId: hostileId,
        clientName: '<b onclick="alert(1)">Ứng dụng</b>',
        scopes: ['<svg onload=alert(1)>', 'mcp:read'],
        createdAtLabel: '<i>x</i>',
        expiresAtLabel: '<i>y</i>',
        status: 'active',
      },
    ],
    csrfToken: '"onmouseover="alert(1)',
  });

  // No raw tag or attribute break from any value reaches the page.
  assert.doesNotMatch(html, /<script>/, 'the grant id script tag is escaped');
  assert.doesNotMatch(html, /<img\s/, 'the viewer label tag is escaped');
  assert.doesNotMatch(html, /<b onclick/, 'the client name tag is escaped');
  assert.doesNotMatch(html, /<svg /, 'the unknown scope tag is escaped');
  assert.ok(!html.includes('onerror=alert(1)>'), 'no attribute break from the viewer label');
  assert.ok(!html.includes('"onmouseover="'), 'the CSRF token cannot break out of its attribute');
  assert.match(html, /&lt;script&gt;/, 'what is shown is the escaped text');
  assert.match(html, /&lt;b onclick=&quot;alert\(1\)&quot;&gt;/, 'the client name is escaped, quotes included');

  // The one place the whole grant id travels is the form action, percent-encoded,
  // so a `/` or a `<` cannot leave the path segment.
  const action = /action="([^"]+)"/.exec(html)?.[1] ?? '';
  assert.ok(action.startsWith('/ket-noi/'), 'the action is a fixed path');
  assert.ok(!action.includes('<'), 'the action carries no raw angle bracket');
  assert.ok(!action.includes('/../'), 'an encoded id cannot climb the path');
  assert.equal(decodeURIComponent(action.slice('/ket-noi/'.length, -'/ngat'.length)), hostileId, 'the encoded action still names the exact grant');
});

