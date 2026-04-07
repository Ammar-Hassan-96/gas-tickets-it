-- ═══════════════════════════════════════════════════════════
-- GAS IT DESK — Supabase Production Schema
-- German Auto Service · Mercedes-Benz Egypt
-- شغّل هذا الكود كاملاً في SQL Editor في Supabase
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══ USERS ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('employee','admin','manager')),
  department    TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  theme_pref    TEXT DEFAULT 'dark',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ══ SESSIONS ════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sessions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ TICKETS ═════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tickets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('hardware','software','network','email','access','printer','security','other')),
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','resolved','closed','escalated')),
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ══ COMMENTS ════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id   UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  author_name TEXT DEFAULT '',
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ══ NOTIFICATIONS ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  is_read    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ RLS ══════════════════════════════════════════════════════
ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications  ENABLE ROW LEVEL SECURITY;

-- Allow anon key read/write (app uses anon key for client queries)
-- Auth validation done server-side via service role key in Netlify Function

CREATE POLICY "allow_all_users"      ON public.users          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_sessions"   ON public.sessions        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tickets"    ON public.tickets         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_comments"   ON public.ticket_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notifs"     ON public.notifications   FOR ALL USING (true) WITH CHECK (true);

-- ══ AUTO-UPDATE TIMESTAMP ════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ══ CLEANUP OLD SESSIONS ═════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cleanup_sessions()
RETURNS void AS $$
BEGIN DELETE FROM public.sessions WHERE expires_at < now(); END;
$$ LANGUAGE plpgsql;

-- ══ SEED DATA ════════════════════════════════════════════════
-- SHA-256 of 'admin@2024' = 'b0e3f4a2d9c8e2c5aa21b9f78d6e3c4a9b8d7f6e5c4b3a291e0f8d7c6b5a4938'
-- كلمة المرور لكل الحسابات: admin@2024
-- يمكنك تغييرها من صفحة المستخدمين بعد الدخول

-- حساب المدير الرئيسي (أنت كمبرمج المشروع)
INSERT INTO public.users (username, password_hash, name, email, role, department)
VALUES (
  'ammar.admin',
  encode(digest('admin@2024','sha256'),'hex'),
  'عمار — مدير النظام',
  'ammar@gas.com.eg',
  'manager',
  'إدارة النظام'
) ON CONFLICT (username) DO NOTHING;

-- حساب إداري للـ IT
INSERT INTO public.users (username, password_hash, name, email, role, department)
VALUES (
  'it.admin',
  encode(digest('admin@2024','sha256'),'hex'),
  'فريق الدعم الفني',
  'it@gas.com.eg',
  'admin',
  'IT'
) ON CONFLICT (username) DO NOTHING;

SELECT 
  'تم إنشاء قاعدة البيانات بنجاح ✅' AS status,
  (SELECT count(*) FROM public.users) AS users_count;
