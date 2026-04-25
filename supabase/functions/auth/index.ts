// ═══════════════════════════════════════════════════════════
// GAS Internal Tickets — Supabase Edge Function
// يستبدل netlify/functions/auth.mjs بالكامل
//
// النشر:
//   1. من Supabase Dashboard → Edge Functions → Deploy new function
//   2. اسم الـ function: auth
//   3. الـ URL بيبقى: https://rmlkhgktwologfhphtyz.supabase.co/functions/v1/auth
//
// ملاحظات Deno (مختلفة عن Node.js):
//   - crypto built-in (مش محتاج import)
//   - Deno.env.get() بدل Netlify.env.get()
//   - نفس باقي الكود تقريباً
// ═══════════════════════════════════════════════════════════

// الـ service_role key جوه Supabase نفسه — ما بيخرجش برّه أبداً
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
  ?? "https://rmlkhgktwologfhphtyz.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── CORS Headers ─────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── DB helper (service_role — يتجاوز RLS) ────────────────
async function sb(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${SUPABASE_KEY}`,
      "Content-Type":  "application/json",
      Prefer:          "return=representation",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Auth Admin helper ─────────────────────────────────────
async function authAdmin(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_KEY,
      Authorization:  `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Auth ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Validate JWT → user profile ───────────────────────────
async function validateToken(token: string) {
  if (!token) throw new Error("No token");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Invalid or expired token");
  const authUser = await res.json();
  if (!authUser?.id) throw new Error("Invalid token payload");
  const rows = await sb(
    `/users?id=eq.${authUser.id}&is_active=eq.true&select=id,name,username,role,department`
  );
  if (!rows?.length) throw new Error("User not found or inactive");
  return rows[0];
}

// ── Role helpers ──────────────────────────────────────────
const isSuper   = (u: any) => u?.role === "super_admin";
const isManager = (u: any) => u?.role === "manager";
const sameDept  = (a: string, b: string) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

// ── Audit log ─────────────────────────────────────────────
async function audit(
  userId: string, userName: string, userRole: string,
  action: string, targetType: string, targetId: string, targetName: string
) {
  try {
    await sb("/audit_logs", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId, user_name: userName, user_role: userRole,
        action, target_type: targetType,
        target_id: String(targetId), target_name: targetName,
      }),
    });
  } catch { /* non-critical */ }
}

// ── JSON response helper ──────────────────────────────────
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!SUPABASE_KEY) {
    return json({ error: "Server not configured" }, 503);
  }

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { action } = body;

  // ── 1. RESOLVE USERNAME → EMAIL ──────────────────────────
  // بيحول username لـ email على السيرفر بأمان
  // نفس رسالة الخطأ سواء username غلط أو صح (Anti-enumeration)
  if (action === "resolve_username") {
    const { username } = body;
    if (!username || typeof username !== "string") {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401);
    }
    if (!/^[a-zA-Z0-9._@-]{3,100}$/.test(username.trim())) {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401);
    }
    try {
      const rows = await sb(
        `/users?username=eq.${encodeURIComponent(username.trim())}&is_active=eq.true&select=email`
      );
      if (!rows?.length || !rows[0].email) {
        await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
        return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401);
      }
      return json({ email: rows[0].email });
    } catch {
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401);
    }
  }

  // ── 2. DELETE USER ────────────────────────────────────────
  if (action === "delete_user") {
    const { token, user_id } = body;
    if (!token || !user_id) return json({ error: "بيانات ناقصة" }, 400);
    let requester: any;
    try { requester = await validateToken(token); }
    catch { return json({ error: "غير مصرح" }, 401); }

    if (requester.id === user_id)
      return json({ error: "لا يمكنك حذف حسابك الخاص" }, 400);

    let target: any[];
    try { target = await sb(`/users?id=eq.${user_id}&select=id,name,username,role,department`); }
    catch { return json({ error: "المستخدم غير موجود" }, 404); }
    if (!target?.length) return json({ error: "المستخدم غير موجود" }, 404);

    const t = target[0];
    if (t.username === "ammar.admin") return json({ error: "هذا الحساب محمي" }, 403);

    const allowed = isSuper(requester) ||
      (isManager(requester) && sameDept(requester.department, t.department) &&
       !["manager","super_admin"].includes(t.role));
    if (!allowed) return json({ error: "ليس لديك صلاحية حذف هذا المستخدم" }, 403);

    try {
      await sb(`/users?id=eq.${user_id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await authAdmin(`/users/${user_id}`, { method: "DELETE" });
      await audit(requester.id, requester.name, requester.role, "delete_user", "user", user_id, t.name);
      return json({ ok: true });
    } catch (e: any) {
      return json({ error: "فشل الحذف: " + e.message }, 500);
    }
  }

  // ── 3. CREATE AUTH USER ───────────────────────────────────
  if (action === "create_auth_user") {
    const { token, email, password, name, username, role, department } = body;
    if (!token) return json({ error: "غير مصرح" }, 401);
    if (!email || !password || !username) return json({ error: "بيانات ناقصة" }, 400);
    if (password.length < 8) return json({ error: "كلمة المرور لازم تكون 8 أحرف على الأقل" }, 400);

    let requester: any;
    try { requester = await validateToken(token); }
    catch { return json({ error: "غير مصرح" }, 401); }

    const allowed = isSuper(requester) ||
      (isManager(requester) && sameDept(requester.department, department) &&
       !["manager","super_admin"].includes(role));
    if (!allowed) return json({ error: "ليس لديك صلاحية إضافة مستخدم" }, 403);

    try {
      const data = await authAdmin("/users", {
        method: "POST",
        body: JSON.stringify({
          email, password,
          email_confirm: true,
          user_metadata: { username, name, role, department: department ?? "" },
          app_metadata:  { role, department: department ?? "" },
        }),
      });
      await audit(requester.id, requester.name, requester.role, "create_user", "user", data.id, username);
      return json({ ok: true, auth_id: data.id });
    } catch (e: any) {
      return json({ error: "فشل إنشاء الحساب: " + e.message }, 500);
    }
  }

  // ── 4. CREATE USER PROFILE (fallback لو Trigger ما شتغلش) ─
  if (action === "create_user_profile") {
    const { token, auth_id, name, username, email, role, department, phone } = body;
    if (!token) return json({ error: "غير مصرح" }, 401);

    let requester: any;
    try { requester = await validateToken(token); }
    catch { return json({ error: "غير مصرح" }, 401); }

    const allowed = isSuper(requester) ||
      (isManager(requester) && sameDept(requester.department, department) &&
       !["manager","super_admin"].includes(role));
    if (!allowed) return json({ error: "ليس لديك صلاحية" }, 403);

    try {
      const result = await sb("/users", {
        method: "POST",
        body: JSON.stringify({
          id: auth_id, name, username, email,
          role, department: department ?? "",
          phone: phone ?? null, is_active: true,
        }),
      });
      const user = Array.isArray(result) ? result[0] : result;
      return json({ ok: true, user });
    } catch (e: any) {
      // Trigger سبقنا وخلق الصف → نرجع الموجود
      if (e.message.includes("23505") || e.message.includes("duplicate")) {
        const existing = await sb(`/users?id=eq.${auth_id}&select=*`);
        return json({ ok: true, user: existing?.[0] ?? {} });
      }
      return json({ error: "فشل إنشاء الملف الشخصي: " + e.message }, 500);
    }
  }

  // ── 5. UPDATE AUTH USER ───────────────────────────────────
  if (action === "update_auth_user") {
    const { token, user_id, email, role, department, name, username, new_password } = body;
    if (!token || !user_id) return json({ error: "بيانات ناقصة" }, 400);

    let requester: any;
    try { requester = await validateToken(token); }
    catch { return json({ error: "غير مصرح" }, 401); }

    const allowed = isSuper(requester) ||
      (isManager(requester) && sameDept(requester.department, department));
    if (!allowed) return json({ error: "ليس لديك صلاحية تعديل هذا المستخدم" }, 403);

    if (new_password && new_password.length < 8)
      return json({ error: "كلمة المرور لازم تكون 8 أحرف على الأقل" }, 400);

    try {
      const updateBody: any = {
        email,
        user_metadata: { username, name, role, department: department ?? "" },
        app_metadata:  { role, department: department ?? "" },
      };
      if (new_password) updateBody.password = new_password;

      await authAdmin(`/users/${user_id}`, {
        method: "PUT",
        body: JSON.stringify(updateBody),
      });
      await audit(requester.id, requester.name, requester.role, "update_user", "user", user_id, username);
      return json({ ok: true });
    } catch (e: any) {
      return json({ error: "فشل التحديث: " + e.message }, 500);
    }
  }

  // ── 6. RESET USER PASSWORD ────────────────────────────────
  if (action === "reset_user_password") {
    const { token, user_id, new_password } = body;
    if (!token || !user_id || !new_password) return json({ error: "بيانات ناقصة" }, 400);
    if (new_password.length < 8) return json({ error: "كلمة المرور لازم تكون 8 أحرف على الأقل" }, 400);

    let requester: any;
    try { requester = await validateToken(token); }
    catch { return json({ error: "غير مصرح" }, 401); }

    let target: any[];
    try { target = await sb(`/users?id=eq.${user_id}&select=id,name,username,role,department`); }
    catch { return json({ error: "المستخدم غير موجود" }, 404); }
    if (!target?.length) return json({ error: "المستخدم غير موجود" }, 404);

    const tgt = target[0];
    const allowed = isSuper(requester) ||
      (isManager(requester) && sameDept(requester.department, tgt.department) &&
       !["manager","super_admin"].includes(tgt.role));
    if (!allowed) return json({ error: "ليس لديك صلاحية" }, 403);

    try {
      await authAdmin(`/users/${user_id}`, {
        method: "PUT",
        body: JSON.stringify({ password: new_password }),
      });
      await audit(requester.id, requester.name, requester.role,
        "reset_password", "user", user_id, `${tgt.name} (${tgt.username})`);
      return json({ ok: true });
    } catch (e: any) {
      return json({ error: "فشل تعيين كلمة المرور: " + e.message }, 500);
    }
  }

  // ── 7. DELETE TICKET ──────────────────────────────────────
  if (action === "delete_ticket") {
    const { token, ticket_id } = body;
    if (!token || !ticket_id) return json({ error: "بيانات ناقصة" }, 400);

    let requester: any;
    try { requester = await validateToken(token); }
    catch { return json({ error: "غير مصرح" }, 401); }

    let ticket: any[];
    try { ticket = await sb(`/tickets?id=eq.${ticket_id}&select=id,title,ticket_number,target_department`); }
    catch { return json({ error: "التيكت غير موجود" }, 404); }
    if (!ticket?.length) return json({ error: "التيكت غير موجود" }, 404);

    const tk = ticket[0];
    const allowed = isSuper(requester) ||
      (tk.target_department && isManager(requester) &&
       sameDept(requester.department, tk.target_department));
    if (!allowed) return json({ error: "ليس لديك صلاحية حذف هذا الطلب" }, 403);

    try {
      await sb(`/ticket_comments?ticket_id=eq.${ticket_id}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await sb(`/tickets?id=eq.${ticket_id}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await audit(requester.id, requester.name, requester.role,
        "delete_ticket", "ticket", ticket_id, `${tk.ticket_number} - ${tk.title}`);
      return json({ ok: true });
    } catch (e: any) {
      return json({ error: "فشل الحذف: " + e.message }, 500);
    }
  }

  // ── 8. RESET AUDIT LOG ────────────────────────────────────
  if (action === "reset_audit_log") {
    const { token } = body;
    if (!token) return json({ error: "غير مصرح" }, 401);

    let requester: any;
    try { requester = await validateToken(token); }
    catch { return json({ error: "غير مصرح" }, 401); }
    if (!isSuper(requester)) return json({ error: "لمدير النظام فقط" }, 403);

    try {
      await audit(requester.id, requester.name, requester.role,
        "reset_audit_log", "system", "all", "مسح سجل العمليات الكامل");
      await sb("/audit_logs?id=neq.00000000-0000-0000-0000-000000000000",
        { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return json({ ok: true });
    } catch (e: any) {
      return json({ error: "فشل المسح: " + e.message }, 500);
    }
  }

  // ── 9. GET ACTIVE SESSIONS ────────────────────────────────
  // بعد Supabase Auth — الجلسات بتُدار من Supabase تلقائياً
  // نستخدم auth.users last_sign_in_at كمؤشر للنشاط
  if (action === "get_sessions") {
    const { token } = body;
    if (!token) return json({ error: "غير مصرح" }, 401);

    let requester: any;
    try { requester = await validateToken(token); }
    catch { return json({ error: "غير مصرح" }, 401); }
    if (!isSuper(requester) && !isManager(requester))
      return json({ error: "ليس لديك صلاحية" }, 403);

    try {
      // جلب المستخدمين اللي آخر دخولهم خلال آخر ساعتين
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const authData = await authAdmin(`/users?page=1&per_page=100`);
      const recentUsers = (authData?.users ?? []).filter((u: any) =>
        u.last_sign_in_at && u.last_sign_in_at > twoHoursAgo
      );

      // جلب بيانات الإدارة من public.users
      const isSuperReq = isSuper(requester);
      const myDept = (requester.department ?? "").trim();

      const activeUsers = recentUsers
        .map((u: any) => ({
          name:       u.user_metadata?.name ?? u.email,
          username:   u.user_metadata?.username ?? "",
          role:       u.user_metadata?.role ?? "employee",
          department: (u.user_metadata?.department ?? "").trim(),
          since:      u.last_sign_in_at,
        }))
        .filter((u: any) => u.username !== "ammar.admin")
        .filter((u: any) => isSuperReq ? true : sameDept(u.department, myDept));

      return json({ total: activeUsers.length, users: activeUsers });
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  // ── 10. CHANGE PASSWORD (المستخدم يغير كلمة سره) ─────────
  // بعد Supabase Auth — يستخدم Supabase updateUser مباشرة من الـ client
  // الـ Edge Function هنا كـ proxy للأمان
  if (action === "change_password") {
    const { token, new_password } = body;
    if (!token || !new_password) return json({ error: "بيانات ناقصة" }, 400);
    if (new_password.length < 8) return json({ error: "كلمة المرور لازم تكون 8 أحرف على الأقل" }, 400);

    // نتحقق من الـ JWT أولاً
    let authUser: any;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Invalid token");
      authUser = await res.json();
    } catch { return json({ error: "غير مصرح" }, 401); }

    try {
      await authAdmin(`/users/${authUser.id}`, {
        method: "PUT",
        body: JSON.stringify({ password: new_password }),
      });
      return json({ ok: true });
    } catch (e: any) {
      return json({ error: "فشل التغيير: " + e.message }, 500);
    }
  }

  return json({ error: "Unknown action: " + action }, 400);
});
