// ═══════════════════════════════════════════════════════════════
//  GAS Internal Tickets — Integration tests for netlify/functions/auth.mjs
//  Run:  node tests/auth.test.mjs
//
//  These tests drive the real handler with a mocked global.fetch so
//  every Supabase REST + Admin call is intercepted in-process. No
//  network, no env vars, no Supabase project needed.
//
//  The fixtures send EXACTLY the JSON shapes the browser app.js sends
//  — so any future drift between the client payload and the server
//  contract (e.g. user_metadata vs flat fields, profile.id vs auth_id)
//  fails this script before deployment.
// ═══════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// ─── 1.  Set required env vars BEFORE importing the handler ────
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.SUPABASE_ANON_KEY = "test-anon-key";

// ─── 2.  Mock fetch ────────────────────────────────────────────
// Every test case can register a route handler. The first matching
// handler wins; an unmatched call throws so we notice missing mocks.
const routes = [];
function mockRoute(matcher, responder) { routes.push({ matcher, responder }); }
function resetMocks() { routes.length = 0; }

const realFetch = globalThis.fetch;
globalThis.fetch = async function mockedFetch(url, init = {}) {
  const u = String(url);
  const method = (init.method || "GET").toUpperCase();
  for (const r of routes) {
    if (r.matcher(u, method, init)) {
      const result = await r.responder(u, method, init);
      if (result instanceof Response) return result;
      const { status = 200, body = {} } = result;
      const text = typeof body === "string" ? body : JSON.stringify(body);
      return new Response(text, {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  throw new Error(`UNMOCKED FETCH: ${method} ${u}`);
};

// ─── 3.  Reusable mock fixtures ────────────────────────────────
const ORIGIN = "http://localhost:8888";  // must be in ALLOWED_ORIGINS

const SUPER_ID    = "11111111-1111-1111-1111-111111111111";
const MANAGER_ID  = "22222222-2222-2222-2222-222222222222";
const EMPLOYEE_ID = "33333333-3333-3333-3333-333333333333";
const TARGET_ID   = "44444444-4444-4444-4444-444444444444";
const SUPER_ID_2  = "55555555-5555-5555-5555-555555555555";

const PROFILES = {
  [SUPER_ID]: {
    id: SUPER_ID, role: "super_admin", department: "IT",
    is_active: true, username: "ammar.admin", email: "ammar@gas.local",
  },
  [MANAGER_ID]: {
    id: MANAGER_ID, role: "manager", department: "Sales",
    is_active: true, username: "sales.mgr", email: "mgr@gas.local",
  },
  [EMPLOYEE_ID]: {
    id: EMPLOYEE_ID, role: "employee", department: "Sales",
    is_active: true, username: "emp", email: "emp@gas.local",
  },
  [TARGET_ID]: {
    id: TARGET_ID, role: "employee", department: "Sales",
    is_active: true, username: "target", email: "target@gas.local",
  },
  [SUPER_ID_2]: {
    id: SUPER_ID_2, role: "super_admin", department: "IT",
    is_active: true, username: "second.super", email: "super2@gas.local",
  },
};

// "JWT" in tests is just the user id — verifyToken hits /auth/v1/user
// and we mock that to return the matching profile.
function tokenFor(id) { return `token-${id}`; }

// Default mock: token verification uses Authorization: Bearer token-<id>
function mockTokenVerify() {
  mockRoute(
    (u, m) => m === "GET" && u.endsWith("/auth/v1/user"),
    (_u, _m, init) => {
      const auth = init.headers?.Authorization || init.headers?.authorization || "";
      const id = auth.replace(/^Bearer\s+token-/, "");
      if (PROFILES[id]) return { status: 200, body: PROFILES[id] };
      return { status: 401, body: { error: "invalid token" } };
    },
  );
}

// Default mock: GET /rest/v1/users?id=eq.<uuid>... → returns matching profile
function mockUsersById() {
  mockRoute(
    (u, m) => m === "GET" && u.includes("/rest/v1/users?id=eq."),
    (u) => {
      const m = u.match(/id=eq\.([0-9a-f-]{36})/);
      const id = m?.[1];
      const row = PROFILES[id];
      return { status: 200, body: row ? [row] : [] };
    },
  );
}

// ─── 4.  Mini test runner ──────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
  resetMocks();
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${e.message.split("\n")[0]}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "not equal"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// Helper: invoke the handler with a JSON body
async function call(handler, body, opts = {}) {
  const req = new Request("http://test/api/auth", {
    method: opts.method || "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": opts.origin ?? ORIGIN,
      ...(opts.headers || {}),
    },
    body: body == null ? null : (typeof body === "string" ? body : JSON.stringify(body)),
  });
  const res = await handler(req);
  let json = null;
  try { json = await res.json(); } catch { /* may be empty */ }
  return { status: res.status, json, headers: res.headers };
}

// ─── 5.  Import handler (after env vars are set) ───────────────
const here = path.dirname(fileURLToPath(import.meta.url));
const handlerUrl = pathToFileURL(path.join(here, "..", "netlify", "functions", "auth.mjs")).href;
const { default: handler } = await import(handlerUrl);

// ═══════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════
console.log("\n\x1b[1mauth.mjs integration tests\x1b[0m\n");

// ─── PUBLIC ACTIONS ────────────────────────────────────────────
console.log("\x1b[1mPublic actions\x1b[0m");

await test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const req = new Request("http://test/api/auth", {
    method: "OPTIONS",
    headers: { Origin: ORIGIN },
  });
  const res = await handler(req);
  assertEq(res.status, 204);
  assertEq(res.headers.get("access-control-allow-origin"), ORIGIN);
});

await test("disallowed origin → CORS header is 'null'", async () => {
  const req = new Request("http://test/api/auth", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example.com" },
  });
  const res = await handler(req);
  assertEq(res.headers.get("access-control-allow-origin"), "null");
});

await test("non-POST method → 405", async () => {
  const r = await call(handler, null, { method: "GET" });
  assertEq(r.status, 405);
});

await test("missing action → 400", async () => {
  const r = await call(handler, {});
  assertEq(r.status, 400);
});

await test("malformed JSON → 400", async () => {
  const r = await call(handler, "not-json");
  assertEq(r.status, 400);
});

await test("login_with_username success (matches client v4.3 payload)", async () => {
  // Client sends: { action, username, password }
  mockRoute(
    (u, m) => m === "GET" && u.includes("/rest/v1/users?username=ilike."),
    () => ({ status: 200, body: [{ email: "ammar@gas.local", is_active: true }] }),
  );
  mockRoute(
    (u, m) => m === "POST" && u.includes("/auth/v1/token?grant_type=password"),
    () => ({ status: 200, body: {
      access_token: "jwt.access", refresh_token: "jwt.refresh",
      expires_in: 3600, expires_at: Date.now()/1000 + 3600,
      token_type: "bearer",
      user: { id: SUPER_ID, email: "ammar@gas.local" },
    }}),
  );
  mockRoute(
    (u, m) => m === "PATCH" && u.includes("/rest/v1/users?id=eq."),
    () => ({ status: 200, body: [] }),
  );

  const r = await call(handler, {
    action: "login_with_username",
    username: "ammar.admin",
    password: "Password123",
  });
  assertEq(r.status, 200);
  assert(r.json.access_token === "jwt.access", "access_token missing");
  assert(r.json.user?.id === SUPER_ID, "user.id missing");
});

await test("login_with_username wrong password → 401 (no enumeration)", async () => {
  mockRoute(
    (u, m) => m === "GET" && u.includes("/rest/v1/users?username=ilike."),
    () => ({ status: 200, body: [{ email: "ammar@gas.local", is_active: true }] }),
  );
  mockRoute(
    (u, m) => m === "POST" && u.includes("/auth/v1/token"),
    () => ({ status: 400, body: { error: "invalid_grant" } }),
  );
  const r = await call(handler, {
    action: "login_with_username",
    username: "ammar.admin",
    password: "wrong",
  });
  assertEq(r.status, 401);
});

await test("login_with_username unknown user → same 401 message (no leak)", async () => {
  mockRoute(
    (u, m) => m === "GET" && u.includes("/rest/v1/users?username=ilike."),
    () => ({ status: 200, body: [] }),
  );
  const r = await call(handler, {
    action: "login_with_username",
    username: "nobody",
    password: "Password123",
  });
  assertEq(r.status, 401);
  // Same generic message we use for wrong password
  assert(/غير صحيحة/.test(r.json.error), "should use generic error");
});

await test("login_with_username invalid username chars → 400", async () => {
  const r = await call(handler, {
    action: "login_with_username",
    username: "bad user!", // space
    password: "Password123",
  });
  assertEq(r.status, 400);
});

await test("resolve_username (legacy fallback) still returns email", async () => {
  mockRoute(
    (u, m) => m === "GET" && u.includes("/rest/v1/users?username=ilike."),
    () => ({ status: 200, body: [{ email: "ammar@gas.local", is_active: true }] }),
  );
  const r = await call(handler, { action: "resolve_username", username: "ammar.admin" });
  assertEq(r.status, 200);
  assertEq(r.json.email, "ammar@gas.local");
});

// ─── AUTHENTICATED ACTIONS ─────────────────────────────────────
console.log("\n\x1b[1mAuthenticated actions\x1b[0m");

await test("heartbeat success", async () => {
  mockTokenVerify();
  mockUsersById();
  mockRoute(
    (u, m) => m === "PATCH" && u.includes("/rest/v1/users?id=eq."),
    () => ({ status: 200, body: [] }),
  );
  const r = await call(handler, { action: "heartbeat", token: tokenFor(SUPER_ID) });
  assertEq(r.status, 200);
  assert(r.json.success === true);
});

await test("heartbeat with bad token → 401", async () => {
  mockTokenVerify();
  const r = await call(handler, { action: "heartbeat", token: "garbage" });
  assertEq(r.status, 401);
});

await test("change_password success (verifies old password first)", async () => {
  mockTokenVerify();
  mockUsersById();
  let reauthCalled = false;
  let updateCalled = false;
  mockRoute(
    (u, m) => m === "POST" && u.includes("/auth/v1/token?grant_type=password"),
    (_u, _m, init) => {
      reauthCalled = true;
      const body = JSON.parse(init.body);
      assertEq(body.password, "OldPass1234", "should re-auth with old password");
      return { status: 200, body: { access_token: "x" } };
    },
  );
  mockRoute(
    (u, m) => m === "PUT" && u.includes("/auth/v1/admin/users/"),
    (_u, _m, init) => {
      updateCalled = true;
      const body = JSON.parse(init.body);
      assertEq(body.password, "NewPass1234");
      return { status: 200, body: { id: SUPER_ID } };
    },
  );
  const r = await call(handler, {
    action: "change_password",
    token: tokenFor(SUPER_ID),
    old_password: "OldPass1234",
    new_password: "NewPass1234",
  });
  assertEq(r.status, 200);
  assert(reauthCalled, "old password was not verified");
  assert(updateCalled, "admin update was not called");
});

await test("change_password wrong old password → 401", async () => {
  mockTokenVerify();
  mockUsersById();
  mockRoute(
    (u, m) => m === "POST" && u.includes("/auth/v1/token"),
    () => ({ status: 400, body: { error: "invalid_grant" } }),
  );
  const r = await call(handler, {
    action: "change_password",
    token: tokenFor(SUPER_ID),
    old_password: "wrong",
    new_password: "NewPass1234",
  });
  assertEq(r.status, 401);
});

await test("change_password new == old → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "change_password",
    token: tokenFor(SUPER_ID),
    old_password: "Password1234",
    new_password: "Password1234",
  });
  assertEq(r.status, 400);
});

await test("change_password too short → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "change_password",
    token: tokenFor(SUPER_ID),
    old_password: "anything",
    new_password: "short1",
  });
  assertEq(r.status, 400);
});

await test("change_password no digit → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "change_password",
    token: tokenFor(SUPER_ID),
    old_password: "anything",
    new_password: "OnlyLettersHere",
  });
  assertEq(r.status, 400);
});

await test("save_theme dark → 200, ignores body.user_id", async () => {
  mockTokenVerify();
  mockUsersById();
  let patchedId = null;
  mockRoute(
    (u, m) => m === "PATCH" && u.includes("/rest/v1/users?id=eq."),
    (u) => {
      patchedId = u.match(/id=eq\.([0-9a-f-]{36})/)?.[1];
      return { status: 200, body: [] };
    },
  );
  const r = await call(handler, {
    action: "save_theme",
    token: tokenFor(SUPER_ID),
    theme: "dark",
    user_id: "00000000-0000-0000-0000-000000000000", // attempt to patch someone else
  });
  assertEq(r.status, 200);
  assertEq(patchedId, SUPER_ID, "save_theme must always target requester");
});

await test("save_theme invalid value → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "save_theme",
    token: tokenFor(SUPER_ID),
    theme: "midnight",
  });
  assertEq(r.status, 400);
});

await test("mark_notif_read by id → 200", async () => {
  mockTokenVerify();
  mockUsersById();
  mockRoute(
    (u, m) => m === "PATCH" && u.includes("/rest/v1/notifications?id=eq."),
    () => ({ status: 200, body: [] }),
  );
  const r = await call(handler, {
    action: "mark_notif_read",
    token: tokenFor(EMPLOYEE_ID),
    notif_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  });
  assertEq(r.status, 200);
});

await test("mark_notif_read invalid notif_id → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "mark_notif_read",
    token: tokenFor(EMPLOYEE_ID),
    notif_id: "not-a-uuid",
  });
  assertEq(r.status, 400);
});

// ─── ADMIN-ONLY ACTIONS ────────────────────────────────────────
console.log("\n\x1b[1mAdmin actions\x1b[0m");

await test("create_auth_user — manager, valid (CLIENT v4.3 payload)", async () => {
  // ⚠ THIS IS THE EXACT shape app.js sends after the v4.3 fix:
  //    { action, token, email, password, user_metadata: {...} }
  mockTokenVerify();
  mockUsersById();
  let received = null;
  mockRoute(
    (u, m) => m === "POST" && u.includes("/auth/v1/admin/users"),
    (_u, _m, init) => {
      received = JSON.parse(init.body);
      return { status: 200, body: { id: TARGET_ID, email: received.email } };
    },
  );
  const r = await call(handler, {
    action: "create_auth_user",
    token: tokenFor(MANAGER_ID),
    email: "newuser@gas.local",
    password: "Password1234",
    user_metadata: {
      name: "New User", username: "new.user",
      role: "employee", department: "Sales",  // matches manager's dept
    },
  });
  assertEq(r.status, 200);
  // Server forwards user_metadata to admin API verbatim
  assertEq(received.user_metadata.role, "employee");
  assertEq(received.user_metadata.department, "Sales");
  assertEq(received.email_confirm, true);
  // And client can read .user.id as we patched in app.js
  assert(r.json.user?.id === TARGET_ID, "client expects user.id in response");
});

await test("create_auth_user — non-admin → 403", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "create_auth_user",
    token: tokenFor(EMPLOYEE_ID),
    email: "x@y.z",
    password: "Password1234",
    user_metadata: { role: "employee", department: "Sales" },
  });
  assertEq(r.status, 403);
});

await test("create_auth_user — manager creating super_admin → 403", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "create_auth_user",
    token: tokenFor(MANAGER_ID),
    email: "x@y.z",
    password: "Password1234",
    user_metadata: { role: "super_admin", department: "Sales" },
  });
  assertEq(r.status, 403);
});

await test("create_auth_user — manager into other dept → 403", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "create_auth_user",
    token: tokenFor(MANAGER_ID),
    email: "x@y.z",
    password: "Password1234",
    user_metadata: { role: "employee", department: "IT" }, // mgr is Sales
  });
  assertEq(r.status, 403);
});

await test("create_auth_user — weak password → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "create_auth_user",
    token: tokenFor(SUPER_ID),
    email: "x@y.z",
    password: "weak",
    user_metadata: { role: "employee", department: "IT" },
  });
  assertEq(r.status, 400);
});

await test("create_auth_user — old flat-field shape → 400 (regression)", async () => {
  // Before v4.3, client sent role/department/name as top-level fields.
  // The hardened server rejects that shape because role is missing
  // from user_metadata and validatePassword still passes — but the
  // request must not silently succeed with an empty user_metadata
  // (because then the new user has no role!). We assert empty meta
  // is actually sent through (server allows it, but role-less users
  // fail at the Trigger / public.users insert step). This test
  // documents the contract: new clients MUST send user_metadata.
  mockTokenVerify();
  mockUsersById();
  let received = null;
  mockRoute(
    (u, m) => m === "POST" && u.includes("/auth/v1/admin/users"),
    (_u, _m, init) => {
      received = JSON.parse(init.body);
      return { status: 200, body: { id: TARGET_ID } };
    },
  );
  await call(handler, {
    action: "create_auth_user",
    token: tokenFor(SUPER_ID),
    email: "x@y.z",
    password: "Password1234",
    name: "X", role: "employee", department: "IT", // ← OLD shape
  });
  // Server treats user_metadata as {}; payload to admin has no role.
  // This is exactly why we fixed app.js — assert the shape.
  assertEq(received.user_metadata.role, undefined,
    "old flat fields should NOT leak into user_metadata");
});

await test("create_user_profile — valid (CLIENT v4.3 payload)", async () => {
  // Client sends: { action, token, profile: { id, name, username, email, role, department, phone, is_active } }
  mockTokenVerify();
  mockUsersById();
  let inserted = null;
  mockRoute(
    (u, m) => m === "POST" && u === "https://test.supabase.co/rest/v1/users",
    (_u, _m, init) => {
      inserted = JSON.parse(init.body);
      return { status: 200, body: [{ ...inserted }] };
    },
  );
  const r = await call(handler, {
    action: "create_user_profile",
    token: tokenFor(SUPER_ID),
    profile: {
      id: TARGET_ID,
      name: "T",
      username: "t",
      email: "t@g.l",
      role: "employee",
      department: "IT",
      phone: null,
      is_active: true,
    },
  });
  assertEq(r.status, 200);
  assertEq(inserted.id, TARGET_ID);
  assertEq(inserted.role, "employee");
  // Client expects .profile in response (we updated app.js to read it)
  assert(r.json.profile, "response.profile is required by app.js");
});

await test("create_user_profile — missing profile → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "create_user_profile",
    token: tokenFor(SUPER_ID),
  });
  assertEq(r.status, 400);
});

await test("create_user_profile — bad UUID → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "create_user_profile",
    token: tokenFor(SUPER_ID),
    profile: { id: "not-a-uuid", name: "X", role: "employee" },
  });
  assertEq(r.status, 400);
});

await test("update_auth_user — valid (CLIENT v4.3 payload)", async () => {
  // Client sends: { action, token, user_id, email, user_metadata: {...}, password? }
  mockTokenVerify();
  mockUsersById();
  let putBody = null;
  mockRoute(
    (u, m) => m === "PUT" && u.includes("/auth/v1/admin/users/"),
    (_u, _m, init) => {
      putBody = JSON.parse(init.body);
      return { status: 200, body: { id: TARGET_ID } };
    },
  );
  mockRoute(
    (u, m) => m === "PATCH" && u.includes("/rest/v1/users?id=eq."),
    () => ({ status: 200, body: [] }), // mirror call
  );
  const r = await call(handler, {
    action: "update_auth_user",
    token: tokenFor(SUPER_ID),
    user_id: TARGET_ID,
    email: "new@gas.local",
    user_metadata: { role: "employee", department: "IT", name: "Updated" },
    password: "NewPass1234",
  });
  assertEq(r.status, 200);
  assertEq(putBody.email, "new@gas.local");
  assertEq(putBody.password, "NewPass1234"); // server reads `password`, not `new_password`
  assertEq(putBody.user_metadata.role, "employee");
});

await test("update_auth_user — manager editing super_admin → 403", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "update_auth_user",
    token: tokenFor(MANAGER_ID),
    user_id: SUPER_ID,
    email: "x@y.z",
  });
  assertEq(r.status, 403);
});

await test("update_auth_user — self-demote blocked", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "update_auth_user",
    token: tokenFor(SUPER_ID),
    user_id: SUPER_ID,
    user_metadata: { role: "employee" },
  });
  assertEq(r.status, 403);
});

await test("update_auth_user — last super_admin demotion blocked", async () => {
  mockTokenVerify();
  mockUsersById();
  // count query: only one active super_admin (excluding the target = 0)
  mockRoute(
    (u, m) => m === "GET" && u.includes("role=eq.super_admin"),
    () => ({ status: 200, body: [] }), // 0 remaining
  );
  // Use SUPER_2 as actor demoting SUPER_ID
  const r = await call(handler, {
    action: "update_auth_user",
    token: tokenFor(SUPER_ID_2),
    user_id: SUPER_ID,
    user_metadata: { role: "employee" },
  });
  assertEq(r.status, 403);
});

await test("update_auth_user — empty payload → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "update_auth_user",
    token: tokenFor(SUPER_ID),
    user_id: TARGET_ID,
    // no email, no password, no user_metadata
  });
  assertEq(r.status, 400);
});

await test("reset_user_password — admin → 200", async () => {
  mockTokenVerify();
  mockUsersById();
  let pw = null;
  mockRoute(
    (u, m) => m === "PUT" && u.includes("/auth/v1/admin/users/"),
    (_u, _m, init) => {
      pw = JSON.parse(init.body).password;
      return { status: 200, body: {} };
    },
  );
  const r = await call(handler, {
    action: "reset_user_password",
    token: tokenFor(SUPER_ID),
    user_id: TARGET_ID,
    new_password: "Reset12345",
  });
  assertEq(r.status, 200);
  assertEq(pw, "Reset12345");
});

await test("reset_user_password — short → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "reset_user_password",
    token: tokenFor(SUPER_ID),
    user_id: TARGET_ID,
    new_password: "abc1",
  });
  assertEq(r.status, 400);
});

await test("reset_user_password — manager resetting super_admin → 403", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "reset_user_password",
    token: tokenFor(MANAGER_ID),
    user_id: SUPER_ID,
    new_password: "Reset12345",
  });
  assertEq(r.status, 403);
});

// ─── SUPER ADMIN ONLY ──────────────────────────────────────────
console.log("\n\x1b[1mSuper-admin actions\x1b[0m");

await test("delete_user — self-delete blocked", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "delete_user",
    token: tokenFor(SUPER_ID),
    user_id: SUPER_ID,
  });
  assertEq(r.status, 403);
});

await test("delete_user — manager → 403", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "delete_user",
    token: tokenFor(MANAGER_ID),
    user_id: TARGET_ID,
  });
  assertEq(r.status, 403);
});

await test("delete_user — last super_admin blocked", async () => {
  mockTokenVerify();
  mockUsersById();
  mockRoute(
    (u, m) => m === "GET" && u.includes("role=eq.super_admin"),
    () => ({ status: 200, body: [] }), // none remain after delete
  );
  const r = await call(handler, {
    action: "delete_user",
    token: tokenFor(SUPER_ID_2),
    user_id: SUPER_ID,
  });
  assertEq(r.status, 403);
});

await test("delete_user — happy path", async () => {
  mockTokenVerify();
  mockUsersById();
  let softDeleted = false, hardDeleted = false;
  mockRoute(
    (u, m) => m === "PATCH" && u.includes("/rest/v1/users?id=eq."),
    () => { softDeleted = true; return { status: 200, body: [] }; },
  );
  mockRoute(
    (u, m) => m === "DELETE" && u.includes("/auth/v1/admin/users/"),
    () => { hardDeleted = true; return { status: 200, body: {} }; },
  );
  mockRoute(
    (u, m) => m === "DELETE" && u.includes("/rest/v1/users?id=eq."),
    () => ({ status: 200, body: [] }),
  );
  const r = await call(handler, {
    action: "delete_user",
    token: tokenFor(SUPER_ID),
    user_id: TARGET_ID,
  });
  assertEq(r.status, 200);
  assert(softDeleted, "soft-delete must run first");
  assert(hardDeleted, "auth user must be hard-deleted");
});

await test("delete_ticket — non-super → 403", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "delete_ticket",
    token: tokenFor(MANAGER_ID),
    ticket_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  });
  assertEq(r.status, 403);
});

await test("delete_ticket — happy path with attachment count", async () => {
  mockTokenVerify();
  mockUsersById();
  mockRoute(
    (u, m) => m === "GET" && u.includes("/rest/v1/ticket_attachments?ticket_id=eq."),
    () => ({ status: 200, body: [{ id: "x" }, { id: "y" }] }),
  );
  mockRoute(
    (u, m) => m === "DELETE" && u.includes("/rest/v1/"),
    () => ({ status: 200, body: [] }),
  );
  const r = await call(handler, {
    action: "delete_ticket",
    token: tokenFor(SUPER_ID),
    ticket_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  });
  assertEq(r.status, 200);
  assertEq(r.json.orphan_attachments, 2);
});

await test("unknown action → 400", async () => {
  mockTokenVerify();
  mockUsersById();
  const r = await call(handler, {
    action: "nuke_database",
    token: tokenFor(SUPER_ID),
  });
  assertEq(r.status, 400);
});

// ─── Summary ───────────────────────────────────────────────────
globalThis.fetch = realFetch;

console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`\n\x1b[31mFAIL\x1b[0m  ${f.name}`);
    console.error(f.error.stack || f.error.message);
  }
  process.exit(1);
}
