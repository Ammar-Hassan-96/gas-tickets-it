-- ═══════════════════════════════════════════════════════════
-- GAS INTER-DEPARTMENT TICKET SYSTEM — Migration Script
-- German Auto Service · Mercedes-Benz Egypt
-- يحول النظام من IT Helpdesk إلى نظام تيكتات داخلي شامل
-- آمن: لا يحذف أي بيانات موجودة
-- شغّل هذا الكود في Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ══ 1) إضافة حقول جديدة على التيكتات ══════════════════════
-- target_department = الإدارة المسؤولة عن معالجة التيكت
-- request_type      = نوع الطلب داخل الإدارة المختارة
-- attachments       = قائمة JSON بالمرفقات [{name, url, size, type}]

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS target_department TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS request_type      TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachments       JSONB DEFAULT '[]'::jsonb;

-- نحذف القيد القديم على category (اللي كان بيسمح بـ hardware/software/... فقط)
-- عشان نسمح بأي قيمة دلوقتي (التوافق مع البيانات القديمة + يشتغل كـ fallback)
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_category_check;

-- نخلي category اختياري (مش لازم)
ALTER TABLE public.tickets
  ALTER COLUMN category DROP NOT NULL;

-- ══ 2) جدول خريطة الإدارات والطلبات (قابل للتعديل من المدير) ══
CREATE TABLE IF NOT EXISTS public.department_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  department    TEXT NOT NULL,
  request_type  TEXT NOT NULL,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department, request_type)
);

ALTER TABLE public.department_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_dept_requests" ON public.department_requests;
CREATE POLICY "allow_all_dept_requests" ON public.department_requests
  FOR ALL USING (true) WITH CHECK (true);

-- ══ 3) تعبئة الخريطة الافتراضية للإدارات والطلبات ══════════
INSERT INTO public.department_requests (department, request_type, sort_order) VALUES
  -- الخدمة
  ('الخدمة', 'طلب عربية بديلة',          1),
  ('الخدمة', 'متابعة حالة صيانة',         2),
  ('الخدمة', 'استفسار عن موعد تسليم',     3),
  ('الخدمة', 'شكوى فنية',                 4),
  ('الخدمة', 'طلب تقدير تكلفة',           5),
  ('الخدمة', 'أخرى',                      99),

  -- الكول سنتر
  ('الكول سنتر', 'تحويل عميل',            1),
  ('الكول سنتر', 'بيانات عميل',           2),
  ('الكول سنتر', 'متابعة موعد',           3),
  ('الكول سنتر', 'استفسار حملة',          4),
  ('الكول سنتر', 'أخرى',                  99),

  -- IT
  ('IT', 'مشكلة جهاز',                    1),
  ('IT', 'مشكلة شبكة',                    2),
  ('IT', 'طلب صلاحيات',                   3),
  ('IT', 'مشكلة بريد إلكتروني',           4),
  ('IT', 'مشكلة طابعة',                   5),
  ('IT', 'تركيب/تحديث برنامج',            6),
  ('IT', 'أمن معلومات',                   7),
  ('IT', 'أخرى',                          99),

  -- CRM
  ('CRM', 'تحديث بيانات عميل',            1),
  ('CRM', 'إضافة عميل جديد',              2),
  ('CRM', 'سحب تقرير',                    3),
  ('CRM', 'مشكلة في النظام',              4),
  ('CRM', 'استفسار CSI',                  5),
  ('CRM', 'أخرى',                         99),

  -- الحسابات
  ('الحسابات', 'طلب فاتورة',              1),
  ('الحسابات', 'مردودات',                 2),
  ('الحسابات', 'كشف حساب',                3),
  ('الحسابات', 'صرف مصروفات',             4),
  ('الحسابات', 'موافقات مالية',           5),
  ('الحسابات', 'أخرى',                    99),

  -- المبيعات
  ('المبيعات', 'طلب عرض سعر',             1),
  ('المبيعات', 'توفر موديل',              2),
  ('المبيعات', 'كتالوج/بروشور',           3),
  ('المبيعات', 'متابعة عميل محتمل',       4),
  ('المبيعات', 'أخرى',                    99),

  -- قطع الغيار
  ('قطع الغيار', 'توفر قطعة',             1),
  ('قطع الغيار', 'طلب توريد',             2),
  ('قطع الغيار', 'سعر قطعة',              3),
  ('قطع الغيار', 'إرجاع قطعة',            4),
  ('قطع الغيار', 'أخرى',                  99),

  -- الصيانة
  ('الصيانة', 'حجز موعد',                 1),
  ('الصيانة', 'استعجال إصلاح',            2),
  ('الصيانة', 'استلام سيارة',             3),
  ('الصيانة', 'تقييم فني',                4),
  ('الصيانة', 'أخرى',                     99),

  -- الموارد البشرية
  ('الموارد البشرية', 'طلب إجازة',        1),
  ('الموارد البشرية', 'شهادة خبرة',       2),
  ('الموارد البشرية', 'استفسار مرتب',     3),
  ('الموارد البشرية', 'تظلم',             4),
  ('الموارد البشرية', 'أخرى',             99),

  -- المخازن
  ('المخازن', 'صرف مستلزمات',             1),
  ('المخازن', 'جرد',                      2),
  ('المخازن', 'توفر بضاعة',               3),
  ('المخازن', 'أخرى',                     99)
ON CONFLICT (department, request_type) DO NOTHING;

-- ══ 4) Storage Bucket للمرفقات ═════════════════════════════
-- شغّل هذا الجزء مرة واحدة فقط
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  true,
  10485760,  -- 10 MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip','application/x-rar-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- سياسات الـ Storage (قراءة عامة، رفع/حذف بدون قيود — الـ auth على مستوى التطبيق)
DROP POLICY IF EXISTS "ticket_attachments_read"   ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "ticket_attachments_delete" ON storage.objects;

CREATE POLICY "ticket_attachments_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ticket-attachments');
CREATE POLICY "ticket_attachments_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ticket-attachments');
CREATE POLICY "ticket_attachments_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'ticket-attachments');

-- ══ 5) فهارس للبحث السريع ══════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tickets_target_dept ON public.tickets(target_department);
CREATE INDEX IF NOT EXISTS idx_tickets_request_type ON public.tickets(request_type);
CREATE INDEX IF NOT EXISTS idx_dept_reqs_dept ON public.department_requests(department, is_active);

-- ══ 6) التحقق ═══════════════════════════════════════════════
SELECT
  'Migration completed ✅' AS status,
  (SELECT count(*) FROM public.department_requests) AS dept_requests_count,
  (SELECT count(DISTINCT department) FROM public.department_requests) AS departments_count;
