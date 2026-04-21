-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — Migration v4 (Merge resolved → closed)
-- آمن ضد أي Supabase SQL Editor quirks
-- ═══════════════════════════════════════════════════════════

-- تحديد الـ schema بصراحة (مهم لبعض الـ SQL Editors)
SET search_path TO public;

-- ══ 0) فحص أولي: هل الجدول موجود؟ ═══════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tickets'
  ) THEN
    RAISE EXCEPTION 'جدول public.tickets غير موجود! تأكد من تشغيل supabase-setup.sql أولاً.';
  END IF;
END $$;

-- ══ 1) تحويل كل التيكتات resolved إلى closed ═══════════════
UPDATE public.tickets
   SET status = 'closed',
       updated_at = now()
 WHERE status = 'resolved';

-- ══ 2) تحديث الـ CHECK constraint ══════════════════════════
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('open','assigned','in_progress','closed','escalated','archived'));

-- ══ 3) التحقق ═══════════════════════════════════════════════
SELECT
  'Migration v4 completed ✅' AS status,
  (SELECT count(*) FROM public.tickets WHERE status = 'resolved') AS remaining_resolved,
  (SELECT count(*) FROM public.tickets WHERE status = 'closed')   AS total_closed,
  (SELECT count(*) FROM public.tickets WHERE status = 'open')     AS total_open,
  (SELECT count(*) FROM public.tickets WHERE status = 'assigned') AS total_assigned,
  (SELECT count(*) FROM public.tickets WHERE status = 'in_progress') AS total_in_progress;
