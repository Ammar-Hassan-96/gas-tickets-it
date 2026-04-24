# GAS Internal Tickets — v3.0 (Security Hardening Phase 1)

## 🔐 ما الجديد — الأمان الحقيقي

### المشكلة اللي اتحلّت (Postman Attack)
قبل هذا الإصدار:
```bash
# Postman attack نجح مع أي حد عنده الـ anon key
curl https://your-project.supabase.co/rest/v1/users \
  -H "apikey: <anon-key>" \
  -X DELETE
```
**النتيجة**: مسح كل الـ users! لأن الـ RLS كان `allow_all`.

بعد هذا الإصدار:
- كل الـ RLS policies بقت **ذكية ومحكمة على مستوى قاعدة البيانات**
- نفس الـ Postman attack يرجع `[]` بدون أي بيانات
- حتى لو الـ client code اتكسر، قاعدة البيانات محمية

---

## 🏗️ كيف يشتغل النظام الجديد

```
Browser → app.js → Supabase REST API → [RLS Check] → Database
                         ↑                   ↓
                         │              app_current_user()
                         │              بيقرأ x-session-token
                         │              ويفحص سجل المستخدم
                         │
                   x-session-token header
                   ده اللي يفرّق حساب عن آخر
```

**الفرق الجوهري**: قبل كده الـ RLS كانت بتقبل أي طلب. دلوقتي RLS بتفحص:
1. مين أنت؟ (عبر قراءة الـ session token من الـ header)
2. إيه دورك؟ (super_admin / manager / supervisor / employee)
3. هل عندك صلاحية على الصف ده؟ (استناداً على الإدارة + الدور + العلاقة)

---

## 📂 ملفات التثبيت (بالترتيب!)

### أ) إذا كنت بتعمل setup من الصفر:
```
1) supabase-setup.sql                     (أساس الـ DB)
2) supabase-migration-internal.sql        (إدارات + مرفقات)
3) supabase-migration-roles-v2.sql        (نظام الأدوار الهرمي)
4) supabase-migration-v3-data-fixes.sql   (trim + fixes)
5) supabase-migration-v4-merge-statuses.sql (دمج resolved→closed)
6) supabase-rls-hardening-part1.sql       ⭐ جديد
7) supabase-rls-hardening-part2.sql       ⭐ جديد
8) supabase-rls-hardening-part3.sql       ⭐ جديد
```

### ب) إذا كان عندك DB شغال (زيّك دلوقتي):
شغّل بس الـ RLS hardening (parts 1-3) — بالترتيب.

### ج) بعد التشغيل (اختبار الأمان):
```
supabase-rls-attack-test.sql              ← بيختبر إن Postman attack بيفشل
```

---

## 🚀 خطوات التفعيل

### 1️⃣ شغّل Part 1 في Supabase SQL Editor
```
File: supabase-rls-hardening-part1.sql
```
ده يضيف:
- دوال مساعدة (`app_current_user`, `app_is_super`, ...)
- Policies على جدول `users` و `sessions`

**توقع**: في الآخر رسالة `✅ Phase 1 applied` + عدد الـ policies

### 2️⃣ شغّل Part 2
```
File: supabase-rls-hardening-part2.sql
```
ده يضيف:
- Policies على `tickets` (الأهم!) — inbound/outbound logic
- Policies على `ticket_comments` و `notifications`
- Policies على `department_requests`

**توقع**: ملخص لكل جدول وعدد الـ policies

### 3️⃣ شغّل Part 3
```
File: supabase-rls-hardening-part3.sql
```
ده يضيف:
- Policies على `audit_logs` (لو موجود)
- Policies على Storage bucket (المرفقات)
- تقرير شامل بحالة الأمان

**توقع**: جدول بكل الـ tables وحالة RLS على كل واحد (لازم يكون ✅ RLS Enabled)

### 4️⃣ ارفع الـ `app.js` المحدّث
النسخة الجديدة بتبعت `x-session-token` header تلقائياً في كل request.
**بدون التحديث ده، التطبيق هيرجع "no data"!**

### 5️⃣ (اختياري) اختبر الأمان
```
File: supabase-rls-attack-test.sql
```
يحاكي Postman attack ويطبع النتائج.
**المطلوب**: كل الاختبارات تطلع `✅ PASS`.

---

## 🧪 اختبار يدوي للأمان

بعد التثبيت، جرب من Terminal/Postman:

### ❌ محاولة 1: قراءة users بدون session token
```bash
curl "https://rmlkhgktwologfhphtyz.supabase.co/rest/v1/users" \
  -H "apikey: <YOUR_ANON_KEY>" \
  -H "Authorization: Bearer <YOUR_ANON_KEY>"
```
**المطلوب**: `[]` (array فاضي) — أنت مش مصرح

### ❌ محاولة 2: حذف تيكت
```bash
curl -X DELETE "https://rmlkhgktwologfhphtyz.supabase.co/rest/v1/tickets?id=eq.xxx" \
  -H "apikey: <YOUR_ANON_KEY>"
```
**المطلوب**: 0 rows affected — الـ RLS رفض

### ✅ محاولة 3: قراءة من التطبيق (مع login)
اعمل login عادي من الـ UI — المطلوب يشتغل طبيعي.
الـ `x-session-token` بيتبعت تلقائياً من app.js.

---

## 🔒 طبقات الأمان دلوقتي

```
┌─────────────────────────────────┐
│  Layer 1: UI (Perm.canXxx)      │ ← تحسين تجربة (يخفي أزرار)
├─────────────────────────────────┤
│  Layer 2: State (visibleXxx)    │ ← فلترة UI قبل العرض
├─────────────────────────────────┤
│  Layer 3: Edge Functions        │ ← delete_user, delete_ticket, ...
│  (auth.mjs)                     │
├─────────────────────────────────┤
│  Layer 4: RLS Policies  ⭐ جديد │ ← حماية على مستوى DB
│  (حتى لو كل الطبقات فوق اتكسرت)│
└─────────────────────────────────┘
```

**قبل v3.0**: Layer 4 كان `allow_all` — يعني مفيش حماية حقيقية
**بعد v3.0**: Layer 4 محكم — حتى لو Postman/curl مع الـ anon key، الـ DB ترفض

---

## 🛠️ Troubleshooting

### "لا توجد بيانات" بعد التشغيل
**السبب**: الـ app.js القديم لسه مش بيبعت `x-session-token`
**الحل**: تأكد إنك رفعت `app.js` الجديد وعملت Ctrl+Shift+R في المتصفح

### "permission denied for table users"
**السبب**: app.js بيعمل request قبل login
**الحل**: طبيعي — الـ login form نفسه يمر عبر Netlify function، مش sbFetch

### "app_current_user_id() does not exist"
**السبب**: ما شغّلتش Part 1
**الحل**: ارجع شغّل `supabase-rls-hardening-part1.sql` الأول

### أريد أرجع `allow_all` مؤقتاً
```sql
-- ⚠️ خطير — يلغي كل الأمان
DROP POLICY IF EXISTS "users_select" ON public.users;
-- ... لكل policy
CREATE POLICY "allow_all_temp" ON public.users FOR ALL USING (true) WITH CHECK (true);
```
**بس ده يخليك عرضة للـ Postman attack تاني — استخدم للـ debug فقط**

---

## 🎯 إيه اللي لسه محتاج في Phase 2 و 3

### Phase 2 (شات جاي): توسيع Edge Functions
- إنشاء تيكت يتم من السيرفر (validation + sanitization)
- تحديث حالة يمر من السيرفر
- Rate limiting حقيقي

### Phase 3: Code refactor
- تقسيم app.js لـ modules
- تحسين الأداء
- Tests

---

**تم التطوير بواسطة عمار — German Auto Service · Mercedes-Benz Egypt**
**v3.0 · Security Hardening Phase 1 · Apr 2026**
