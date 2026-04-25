// ═══════════════════════════════════════════════════════════
// GAS Internal Tickets — Netlify Function
// Path: netlify/functions/auth.mjs
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = "https://rmlkhgktwologfhphtyz.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── CORS Headers ─────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── DB helper (service_role — bypasses RLS) ──────────────
async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Auth Admin helper ─────────────────────────────────────
async function authAdmin(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Auth ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── SHA-256 hashing ───────────────────────────────────────
async function sha256(msg) {
  const encoder = new TextEncoder();
  const data = encoder.encode(msg);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

export default async function handler(req, context) {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ──────────────────────────────────────────────────────
    // ACTION: login
    // ──────────────────────────────────────────────────────
    if (action === "login") {
      const { username, password } = body;
      if (!username || !password) {
        return new Response(
          JSON.stringify({ error: "Missing username/password" }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // 1. Get user from public.users
      const users = await sb(`/users?username=eq.${encodeURIComponent(username)}`);
      if (!users || users.length === 0) {
        return new Response(
          JSON.stringify({ error: "Invalid credentials" }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const user = users[0];

      // 2. Check if user is active
      if (!user.is_active) {
        return new Response(
          JSON.stringify({ error: "Account disabled" }),
          { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // 3. Get auth.users record
      const authUsers = await authAdmin(`/users?id=eq.${user.id}`);
      if (!authUsers?.users || authUsers.users.length === 0) {
        return new Response(
          JSON.stringify({ error: "Auth user not found" }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const authUser = authUsers.users[0];
      const storedHash = authUser.encrypted_password;

      // 4. Hash the provided password
      const providedHash = await sha256(password);

      // 5. Compare hashes
      if (storedHash !== providedHash) {
        return new Response(
          JSON.stringify({ error: "Invalid credentials" }),
          { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // 6. Generate session token
      const token = crypto.randomUUID();
      const hashedToken = await sha256(token);

      // 7. Create session
      await sb("/sessions", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          token: hashedToken,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      // 8. Return success with token
      return new Response(
        JSON.stringify({
          token,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
          },
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ──────────────────────────────────────────────────────
    // ACTION: register
    // ──────────────────────────────────────────────────────
    if (action === "register") {
      const { username, password, name, email, role, department } = body;

      if (!username || !password || !email) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // 1. Check if username exists
      const existingUsers = await sb(`/users?username=eq.${encodeURIComponent(username)}`);
      if (existingUsers && existingUsers.length > 0) {
        return new Response(
          JSON.stringify({ error: "Username already exists" }),
          { status: 409, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // 2. Hash password
      const hashedPassword = await sha256(password);

      // 3. Create auth.users record
      const authUser = await authAdmin("/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password: hashedPassword,
          email_confirm: true,
          user_metadata: {
            username,
            name: name || username,
            role: role || "employee",
            department: department || "",
          },
        }),
      });

      // 4. Create public.users record
      await sb("/users", {
        method: "POST",
        body: JSON.stringify({
          id: authUser.id,
          username,
          name: name || username,
          email,
          role: role || "employee",
          department: department || "",
          is_active: true,
        }),
      });

      return new Response(
        JSON.stringify({ success: true, user_id: authUser.id }),
        { status: 201, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ──────────────────────────────────────────────────────
    // ACTION: logout
    // ──────────────────────────────────────────────────────
    if (action === "logout") {
      const { token } = body;
      if (!token) {
        return new Response(
          JSON.stringify({ error: "Missing token" }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const hashedToken = await sha256(token);
      await sb(`/sessions?token=eq.${hashedToken}`, { method: "DELETE" });

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ──────────────────────────────────────────────────────
    // Unknown action
    // ──────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Auth error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
}

export const config = {
  path: "/api/auth"
};
