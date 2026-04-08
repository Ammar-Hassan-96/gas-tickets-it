import crypto from "node:crypto";

const SUPABASE_URL = Netlify.env.get("SUPABASE_URL");
const SUPABASE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json(
      { error: "Server not configured — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify" },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;

  if (action === "login") {
    const { username, password } = body;
    if (!username || !password) {
      return Response.json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" }, { status: 400 });
    }
    const hash = sha256(password);
    let users;
    try {
      users = await sb(
        `/users?username=eq.${encodeURIComponent(username)}&password_hash=eq.${hash}&is_active=eq.true&select=id,name,username,email,role,department,phone,theme_pref`
      );
    } catch (e) {
      return Response.json({ error: "خطأ في الاتصال بقاعدة البيانات: " + e.message }, { status: 500 });
    }
    if (!users?.length) {
      return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
    }
    const user = users[0];
    const token = generateToken();
    const tokenHash = sha256(token);
    const expires = new Date(Date.now() + 10 * 3600 * 1000).toISOString();
    try {
      await sb("/sessions", {
        method: "POST",
        body: JSON.stringify({ user_id: user.id, token: tokenHash, expires_at: expires }),
      });
    } catch { /* optional */ }
    return Response.json({ user, token });
  }

  if (action === "validate") {
    const { token } = body;
    if (!token) return Response.json({ error: "No token" }, { status: 401 });
    const tokenHash = sha256(token);
    let sessions;
    try {
      sessions = await sb(
        `/sessions?token=eq.${tokenHash}&expires_at=gt.${new Date().toISOString()}&select=user_id`
      );
    } catch { return Response.json({ error: "Database error" }, { status: 500 }); }
    if (!sessions?.length) return Response.json({ error: "Invalid or expired session" }, { status: 401 });
    let users;
    try {
      users = await sb(
        `/users?id=eq.${sessions[0].user_id}&is_active=eq.true&select=id,name,username,email,role,department,phone,theme_pref`
      );
    } catch { return Response.json({ error: "Database error" }, { status: 500 }); }
    if (!users?.length) return Response.json({ error: "User not found" }, { status: 401 });
    return Response.json({ user: users[0] });
  }

  if (action === "mark_notif_read") {
    const { user_id, notif_id } = body;
    try {
      if (notif_id) {
        await sb(`/notifications?id=eq.${notif_id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
      } else if (user_id) {
        await sb(`/notifications?user_id=eq.${user_id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
      }
    } catch { /* non-critical */ }
    return Response.json({ ok: true });
  }

  if (action === "save_theme") {
    const { user_id, theme } = body;
    try {
      await sb(`/users?id=eq.${user_id}`, { method: "PATCH", body: JSON.stringify({ theme_pref: theme }) });
    } catch { /* non-critical */ }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
};

export const config = {
  path: "/api/auth",
};
