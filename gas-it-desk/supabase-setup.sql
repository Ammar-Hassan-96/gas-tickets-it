-- ═══════════════════════════════════════════════════════
-- GAS IT Desk — Supabase Database Setup
-- German Auto Service · Mercedes-Benz Egypt
-- ═══════════════════════════════════════════════════════
-- الخطوات:
-- 1. افتح Supabase → SQL Editor
-- 2. الصق الكود كله واضغط Run
-- 3. من Settings → API: انسخ URL و anon key
-- 4. ضعهم في index.html (SUPABASE_URL / SUPABASE_KEY)
-- 5. من Environment Variables في Netlify أضف:
--    SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══ USERS ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('employee','admin','manager')),
  department    TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ══ SESSIONS ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sessions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ TICKETS ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tickets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('hardware','software','network','email','access','printer','security','other')),
  priority      TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','resolved','closed','escalated')),
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ══ TICKET COMMENTS ════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id  UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ RLS ════════════════════════════════════════════════
ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (used by Netlify Functions)
-- Anon key is NOT used for direct DB access in this system

-- ══ SEED DATA ══════════════════════════════════════════
-- Passwords are SHA-256 of 'pass123'
-- SHA-256('pass123') = '9b8769a4a742959a2d0298c36fb70623f2a2d57be5a368d2a0d279d8a96f0ff7'

INSERT INTO public.users (username, password_hash, name, email, role, department) VALUES
  ('mohammed',  '9b8769a4a742959a2d0298c36fb70623f2a2d57be5a368d2a0d279d8a96f0ff7', 'محمد الأحمد',  'mohammed@gas.com.eg',  'employee', 'المبيعات'),
  ('ahmed.it',  '9b8769a4a742959a2d0298c36fb70623f2a2d57be5a368d2a0d279d8a96f0ff7', 'أحمد كمال',    'ahmed.it@gas.com.eg',  'admin',    'IT'),
  ('sara.it',   '9b8769a4a742959a2d0298c36fb70623f2a2d57be5a368d2a0d279d8a96f0ff7', 'سارة محمود',   'sara.it@gas.com.eg',   'admin',    'IT'),
  ('manager',   '9b8769a4a742959a2d0298c36fb70623f2a2d57be5a368d2a0d279d8a96f0ff7', 'المدير العام', 'manager@gas.com.eg',   'manager',  'الإدارة'),
  ('khalid',    '9b8769a4a742959a2d0298c36fb70623f2a2d57be5a368d2a0d279d8a96f0ff7', 'خالد إبراهيم', 'khalid@gas.com.eg',    'employee', 'الورشة'),
  ('noura',     '9b8769a4a742959a2d0298c36fb70623f2a2d57be5a368d2a0d279d8a96f0ff7', 'نورا سليم',    'noura@gas.com.eg',     'employee', 'خدمة العملاء')
ON CONFLICT DO NOTHING;

-- Sample tickets
DO $$
DECLARE
  emp1 UUID; emp2 UUID; emp3 UUID; it1 UUID;
BEGIN
  SELECT id INTO emp1 FROM public.users WHERE username='mohammed';
  SELECT id INTO emp2 FROM public.users WHERE username='khalid';
  SELECT id INTO emp3 FROM public.users WHERE username='noura';
  SELECT id INTO it1  FROM public.users WHERE username='ahmed.it';

  IF emp1 IS NOT NULL THEN
    INSERT INTO public.tickets (ticket_number, title, description, category, priority, status, created_by, assigned_to, created_at)
    VALUES
      ('GAS-2024-0001','الطابعة لا تستجيب','طابعة مكتب المبيعات متوقفة منذ الصباح','printer','high','open',emp1,NULL,now()-interval '2 days'),
      ('GAS-2024-0002','مشكلة في الشبكة','سرعة الإنترنت بطيئة جداً في الطابق الثاني','network','medium','in_progress',emp2,it1,now()-interval '1 day'),
      ('GAS-2024-0003','نسيت كلمة المرور','لا أستطيع الدخول على نظام ERP','access','high','resolved',emp3,NULL,now()-interval '3 days'),
      ('GAS-2024-0004','الحاسوب بطيء','الحاسوب يأخذ 10 دقائق للتشغيل','hardware','low','open',emp1,NULL,now()-interval '1 hour'),
      ('GAS-2024-0005','فيروس مشتبه به','ظهرت نوافذ منبثقة غريبة على الشاشة','security','critical','assigned',emp2,it1,now()-interval '2 hours')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

SELECT 'Setup complete ✅' AS status;
