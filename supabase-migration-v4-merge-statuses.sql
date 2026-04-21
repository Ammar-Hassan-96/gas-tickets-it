-- ═══════════════════════════════════════════════════════════
-- GAS Internal Tickets — Migration v4 (Merge resolved → closed)
-- دمج الحالات "محلول" و "مغلق" في حالة واحدة: "مغلق"
-- آمن 100% — ما يحذفش أي بيانات
-- ═══════════════════════════════════════════════════════════

-- ══ 1) تحويل كل التيكتات resolved إلى closed ═══════════════
UPDATE public.tickets
   SET status = 'closed',
       updated_at = now()
 WHERE status = 'resolved';

-- ══ 2) تحديث الـ CHECK constraint (إزالة resolved من القائمة المسموحة) ═
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

-- ──────────────────────────────────────────────────────────
-- النتيجة المتوقعة: remaining_resolved = 0
-- كل التيكتات اللي كانت "محلولة" اتحولت لـ "مغلقة"
-- ──────────────────────────────────────────────────────────
