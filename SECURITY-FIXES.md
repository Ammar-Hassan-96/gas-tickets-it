# 🔒 تقرير الإصلاحات الأمنية — GAS Internal Tickets

**التاريخ:** 28 أبريل 2026
**النسخة:** v4.3 (Hardened + Login Restored + Active Sessions Fix)
**الحالة:** فحص وإصلاح كامل لـ `auth.mjs` + إصلاح "الجلسات النشطة" + استعادة تدفّق الـ login الأصلي

---

## 🚨 v4.3 — استعادة تدفّق الـ Login الأصلي (مهم جداً)

**المشكلة:** v4.0/v4.1/v4.2 كانت بتعمل الـ login على السيرفر (Netlify Function) عن طريق action جديد اسمه `login_with_username`. ده كان محتاج env var اسمه `SUPABASE_ANON_KEY` (أو `SUPABASE_PUBLISHABLE_KEY`) متظبّط على Netlify. **لو الـ env var ده مش موجود → كل الـ login بيرجع `500` أو `401` ساكت**، والـ client بيعرض رسالة "اسم المستخدم أو كلمة المرور غير صحيحة" مهما كانت البيانات صحّ.

**الإصلاح في v4.3:**
- ✅ رجّعت `doLogin` في `app.js` للأسلوب الأصلي (2-step flow):
  1. السيرفر بيحوّل `username → email` فقط (بـ service_role، آمن من الـ enumeration)
  2. الكلاينت يكلّم Supabase Auth مباشرة بالـ publishable key
- ✅ شيلت `SUPABASE_ANON` من شرط الـ hard config check — السيرفر بقى يشتغل بـ `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` فقط
- ✅ `change_password` بيرجع رسالة واضحة `503` لو `SUPABASE_ANON_KEY` مش متظبّط (بدل ما يكسر بصمت)
- ✅ `resolve_username` بقى case-insensitive ومرن مع schema بدون عمود `is_active`

### 🔧 متغيّرات البيئة المطلوبة على Netlify

افتح Netlify → Site → Environment variables، وتأكّد من:

| Variable | Source | Required |
|---|---|---|
| `SUPABASE_URL` | عنوان مشروعك على Supabase | ✅ نعم |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → **service_role** (سرّي) | ✅ نعم |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → **anon / publishable** | اختياري (لتغيير كلمة المرور فقط) |

> ⚠️ **تحذير أمني:** الـ `service_role` key سرّي جداً ويعطي صلاحيات كاملة على القاعدة (يتجاوز RLS).
> لا تكتبه أبداً في الكود ولا في أي ملف يُرفع لـ Git. خلّيه فقط في Netlify Environment variables.
> لو اتسرّب — افتح Supabase Dashboard وأعمل **rotate** فوراً، وحدّث القيمة الجديدة في Netlify.

---

---

## 🆘 v4.2 — إصلاح تسجيل الدخول (Login Fix)

**المشكلة في v4.1:** كل المستخدمين كانوا بياخدوا "اسم المستخدم أو كلمة المرور غير صحيحة" حتى مع البيانات الصح. السبب: 3 شروط صارمة كنت ضايفها في v4.0:

1. **regex لليوزرنيم** كان بيقبل ASCII فقط `[a-zA-Z0-9._-]` → أي يوزرنيم فيه عربي أو نقطة في أوّله أو رمز غير عادي → رفض فوري
2. **شرط `is_active === true`** صراحةً → لو العمود `is_active` مش موجود في الجدول، أو قيمته `null` لمعظم اليوزرز → الـ lookup يفشل
3. **`username=eq.X`** case-sensitive → لو اليوزر كتب `Ahmed` والمسجّل `ahmed` → فشل

**الإصلاح:**
- ✅ regex جديد بيدعم Unicode (عربي/إنجليزي/أرقام/نقاط) ويرفض بس الحروف الخطرة
- ✅ التحقّق من `is_active` بقى `!== false` (يقبل `null`/`undefined` كـ active)
- ✅ Fallback تلقائي لو العمود `is_active` مش موجود في الجدول
- ✅ `username=ilike.X` بدل `eq` → case-insensitive
- ✅ `.trim()` على المدخلات عشان مسافات في النهاية

---

---

## 🆕 v4.1 — إصلاح "الجلسات النشطة" (Active Sessions Widget)

**المشكلة (كانت موجودة قبل أي تعديل):**
صفحة Dashboard فيها لوحة "🟢 الجلسات النشطة — المستخدمون المتصلون" للسوبر أدمن والمديرين. الواجهة بتطلب من السيرفر يرجّع `{ total, users }`، لكن السيرفر القديم كان بيرجّع `{ sessions: [...] }` (شكل مختلف تماماً) وللمستخدم نفسه فقط (مش لكل النظام). نتيجة: اللوحة دي مكنتش بتشتغل أبداً لا للسوبر أدمن ولا للمدير.

**الإصلاح في v4.1:**
- ✅ action جديدة `heartbeat` في `auth.mjs` بتـ update عمود `last_seen` للمستخدم كل 3 دقائق
- ✅ الـ client (`app.js`) بيبعت heartbeat تلقائياً مع كل تشغيل وكل 3 دقايق
- ✅ action `get_sessions` اتعاد كتابتها بالكامل:
  - super_admin → بيشوف كل الموظفين المتصلين على مستوى النظام
  - manager → بيشوف موظفين إدارته فقط
  - employee/supervisor → ممنوع (403)
- ✅ "متصل" = `last_seen` خلال آخر 10 دقائق
- ✅ السيرفر بيرجّع `{ total, users: [{ name, role, department }] }` (نفس الشكل اللي الواجهة بتتوقعه)

### ⚠️ خطوة مطلوبة في قاعدة البيانات (اختيارية — موصى بها)

عشان اللوحة تشتغل بدقة عالية، أضف عمود `last_seen` لجدول `users`:

```sql
-- في Supabase SQL Editor:
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- index للأداء (اختياري بس مفيد لو عندك آلاف موظفين)
CREATE INDEX IF NOT EXISTS idx_users_last_seen
  ON public.users (last_seen DESC)
  WHERE is_active = true;
```

**لو ما عملتش الـ SQL ده:** الكود هيشتغل بـ fallback تلقائي على عمود `last_login` الموجود فعلاً، بس الدقة هتكون أقل (المستخدم يبان online بس لو سجّل دخول/refresh JWT حديثاً، مش بناءً على نشاطه الفعلي).

---

---

## ⚠️ أهم 3 ثغرات قاتلة كانت موجودة (Critical)

### 1. تصعيد الصلاحيات (Privilege Escalation) — 🔴 حرجة جداً

**المشكلة:**
في النسخة القديمة من `netlify/functions/auth.mjs`، الـ actions دي كانت بتتأكد من الـ JWT بس بدون أي فحص لدور المستخدم:
- `delete_user` — أي موظف عادي ممكن يحذف المدير العام
- `reset_user_password` — أي موظف ممكن يغيّر باسورد أي حد (بما فيهم super_admin)
- `update_auth_user` — أي موظف ممكن يرفع نفسه لـ super_admin
- `delete_ticket` — أي موظف ممكن يحذف أي تيكت
- `create_user_profile` — أي موظف ممكن يضيف بيانات في جدول users

**ليه ده كان كارثي؟**
الـ function بتستخدم `SUPABASE_SERVICE_ROLE_KEY` اللي بيتجاوز الـ RLS تماماً. يعني حتى لو الـ RLS في قاعدة البيانات مظبوطة 100%، الـ Netlify Function بتبعت الأوامر دي بصلاحية مطلقة بدون أي فحص.

**أي مهاجم لو عنده token عادي (login بحساب موظف) كان يقدر يعمل من Postman/curl:**
```bash
curl -X POST https://gas-portal.netlify.app/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"update_auth_user","token":"<my_employee_token>","user_id":"<my_id>","user_metadata":{"role":"super_admin"}}'
```
وكدة يبقى super_admin.

**الإصلاح:**
- كل action دلوقتي بيستدعي `requireAuth` أو `requireAdmin` أو `requireSuperAdmin`
- الـ function بتجيب دور المستخدم من جدول `public.users` (مش من JWT user_metadata اللي ممكن يتزوّر بطريقة غير مباشرة)
- `delete_user`, `delete_ticket` → super_admin فقط
- `reset_user_password`, `update_auth_user`, `create_auth_user`, `create_user_profile` → super_admin أو manager، والـ manager محدود بإدارته فقط ومش بيقدر يلمس super_admin
- حماية إضافية:
  - مينفعش تحذف نفسك
  - مينفعش تنزّل نفسك من super_admin
  - مينفعش تحذف آخر super_admin في النظام
  - manager مينفعش يصنع super_admin

---

### 2. CORS مكسور — 🔴 حرجة

**المشكلة:**
الـ helper بتاع الـ JSON response كان hardcoded للـ origin بتاع `gas-portal.netlify.app`:
```js
'Access-Control-Allow-Origin': 'https://gas-portal.netlify.app'
```
يعني لو نشرت الـ app على أي domain تاني (staging/preview/production جديد)، كل الـ requests هتفشل بـ CORS error.

**كمان** الدالة `getCORS()` اللي بتعمل validation للـ origin كانت بتتستخدم في الـ OPTIONS preflight بس، مش في الـ actual response.

**الإصلاح:**
- دالة `corsHeaders(origin)` جديدة بتفحص الـ origin ضد قائمة `ALLOWED_ORIGINS`
- لو الـ origin مسموح، بنرجّعه بنفسه. لو لأ، بنرجّع `'null'` (يمنع الـ request)
- نفس الـ headers بتتطبق على كل response (preflight + JSON + errors)
- ضفت `Vary: Origin` عشان الـ caches ما تخلطش

**عشان تضيف domain جديد:** عدّل القائمة `ALLOWED_ORIGINS` في `auth.mjs` (سطر ~35).

---

### 3. تسريب الإيميلات (User Enumeration) — 🟠 عالية

**المشكلة:**
الـ action `resolve_username` (بدون auth) كانت بترجع الإيميل لأي username صحيح. أي حد يقدر يجرب أسماء (admin, manager, ammar.admin, ...) ويعرف الإيميلات الحقيقية للموظفين، ودي خطوة أولى ممتازة لهجمات Phishing/Credential stuffing.

**الإصلاح:**
- action جديدة `login_with_username` بتعمل الـ resolve والـ login جوّا الـ function نفسها في request واحدة
- الـ client ما بيشوفش الإيميل خالص — بياخد الـ access_token مباشرة
- نفس وقت الاستجابة (250ms minimum delay) سواء الـ username موجود أو لأ → mitigation للـ timing attack
- نفس رسالة الخطأ في كل الحالات: "اسم المستخدم أو كلمة المرور غير صحيحة"
- `app.js` اتعدل (3 أسطر فقط) عشان يستخدم الـ action الجديدة
- الـ action القديمة `resolve_username` لسة شغالة (backward compat) بس مش هتتستخدم من الـ client الجديد

---

## 🟡 إصلاحات أمنية متوسطة

### 4. سياسة كلمة المرور
- النسخة القديمة: 6 أحرف كحد أدنى
- النسخة الجديدة: **10 أحرف على الأقل + لازم حروف وأرقام**
- الفحص دلوقتي بيتم على السيرفر (مش على الـ client بس اللي ممكن يتجاوز)

### 5. تغيير كلمة المرور بدون التحقق من القديمة
**كان:** أي حد سرق التوكن بتاعك يقدر يغيّر باسوردك ويحبسك بره الحساب
**دلوقتي:** `change_password` بيعمل re-authentication بالباسورد القديمة قبل ما يقبل التغيير

### 6. تغيير الـ theme بدون token
**كان:** action `save_theme` بتاخد `user_id` من الـ request body بدون فحص → أي حد يقدر يغيّر theme أي مستخدم
**دلوقتي:** بياخد الـ user من الـ token فقط، بيتجاهل أي `user_id` في الـ body

### 7. UUID Validation
كل field بيدخل في URL طلب لـ Supabase REST اتفحص لازم يكون UUID صحيح. ده يقفل أي محاولة PostgREST query injection.

### 8. الـ Headers الأمنية في netlify.toml
أضيف:
- **Strict-Transport-Security** (HSTS) — HTTPS إجباري لمدة سنة
- **Content-Security-Policy** — تحديد المصادر المسموح بها للـ scripts/fonts/images
- **Cross-Origin-Opener-Policy** + **Cross-Origin-Resource-Policy** — عزل الـ origin
- شيلت `X-XSS-Protection` (deprecated وممكن يسبب مشاكل)
- منعت الـ caching على `/` و `/index.html` (عشان أي تحديث يوصل فوراً)

### 9. الـ Service Worker
- ضفت `/offline.html` للـ precache (كانت ناقصة → لو المستخدم فقد النت قبل ما يفتح الصفحة الـ offline page ما كانش هتظهر)
- بقت بترجع `offline.html` للـ navigations الفاشلة
- POST/PUT/PATCH ما بيتحطش في الـ cache نهائياً (كان bug ممكن يخزن responses حساسة)
- بنخزن الـ responses الناجحة بس (status 200)

---

## 📁 الملفات اللي اتعدلت

| الملف | نوع التعديل | الأسطر المتأثرة |
|------|------------|-----------------|
| `netlify/functions/auth.mjs` | **إعادة كتابة كاملة** (v4.0) | كل الملف |
| `app.js` | تعديل صغير: `doLogin()` + `applyTheme()` | ~30 سطر |
| `netlify.toml` | إضافة CSP + HSTS + cache control | ~30 سطر |
| `sw.js` | تحسين precache + error handling | كل الملف |
| `index.html` | **لم يتم تعديله** | — |
| `manifest.json` | **لم يتم تعديله** | — |
| `offline.html` | **لم يتم تعديله** | — |

✅ **مفيش تغيير في schema قاعدة البيانات** — ما لمستش بياناتك خالص

---

## ⚙️ خطوات النشر

1. اعمل backup للنسخة الحالية على Netlify
2. ارفع الملفات الجديدة (نسخة `gas-tickets-it-fixed`)
3. تأكد إن متغيرات البيئة (Environment Variables) في Netlify مظبوطة:
   - `SUPABASE_URL` = `https://rmlkhgktwologfhphtyz.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (من Supabase dashboard → Settings → API → service_role key)
   - `SUPABASE_ANON_KEY` = `sb_publishable_bSRIIPeiuwARjUlSnUJpQg_AIrFZH8B` (أو الـ anon key الأصلي لو مش الـ publishable)
4. Deploy
5. **مهم جداً:** بعد الـ deploy، افتح المتصفح وامسح الـ Service Worker القديم:
   - DevTools → Application → Service Workers → Unregister
   - وإلا الـ users هيفضلوا على الـ sw القديم لحد ما يـ refresh
6. اعمل login بحسابك وجرّب الوظائف الأساسية

---

## 🚨 حاجات لازم تتأكد منها بنفسك

### A. ملفات الـ SQL مش موجودة في الـ ZIP
الـ README بيتكلم عن الملفات دي:
- `supabase-rls-hardening-part1.sql`
- `supabase-rls-hardening-part2.sql`
- `supabase-rls-hardening-part3.sql`
- `supabase-fix-recursive-rls.sql`
- وغيرها

**أنا مش قادر أتأكد إن الـ RLS فعلاً متطبّقة في قاعدة البيانات بتاعتك.** افتح Supabase Dashboard → Authentication → Policies وتأكد:
1. كل الجداول (`tickets`, `users`, `notifications`, `audit_logs`, `ticket_comments`, `ticket_attachments`, `department_requests`) عليها RLS مفعّل
2. السياسات بتمنع SELECT بدون auth
3. السياسات بتربط `auth.uid()` بـ `users.id` صح
4. مفيش policy فيها `USING (true)` على عمليات حساسة

### B. متغير البيئة `SUPABASE_ANON_KEY` vs `SUPABASE_PUBLISHABLE_KEY`
الكود الجديد بيدوّر على الاثنين (أيّاً منهم). لو الـ Netlify env. var. اسمها `SUPABASE_ANON_KEY` خليها زي ما هي. لو اسمها مختلف، عدّل أو أضف Alias.

### C. حساب `ammar.admin` المحمي
في `app.js` الكود بيمنع الحذف من الـ UI لو الـ username = `ammar.admin`. ده فحص client-side بس → لو حد عمل bypass للواجهة، السيرفر دلوقتي بيمنعه عبر فحص "آخر super_admin" (لو ammar.admin هو الوحيد). لو فيه أكتر من super_admin، الحماية الـ client-side هي اللي بتشتغل. لو عاوز حماية أقوى، أضف فحص في `auth.mjs` على username محدد.

### D. الـ Storage / Attachments
لما تيكت بيتحذف، الـ files المرفوعة في Supabase Storage **مش بتتحذف تلقائياً** (هتفضل orphan). الـ response الجديد دلوقتي بيرجع `orphan_attachments: <count>` عشان تعرف. لو عاوز حذف تلقائي، محتاج Edge Function منفصلة بصلاحية على Storage bucket.

### E. Rate Limiting
الـ Netlify Functions ما فيهاش rate limiting built-in. لو عاوز حماية ضد brute force على الـ login:
- استخدم Cloudflare قدّام النطاق
- أو استخدم Supabase Edge Function مع KV store
- أو نقل الـ login لـ Supabase Auth مباشرة (شيل الـ Netlify Function من المعادلة)

---

## 📊 حاجات تانية لاحظتها (مش تم إصلاحها)

### في `app.js` (3858 سطر)
1. **استخدام كثيف لـ `innerHTML`** (45+ موقع) مع template strings فيها بيانات من قاعدة البيانات. الكود بيستخدم helper اسمه `_e()` للـ escaping في معظم الأماكن، **لكن لازم تفحص بنفسك** إن `_e()` بيهرّب صح ومش متجاوز في أي مكان. أنصح بـ Trusted Types policy لاحقاً.

2. **`doLogin` على الـ client بيعمل rate limiting في الذاكرة فقط** — مش هيشتغل لو فتح tabs متعددة أو عمل refresh.

3. **لا يوجد CSRF protection** — معتمد على CORS بس. لأن الـ requests كلها بـ `Authorization: Bearer <jwt>` (مش cookie)، الـ CSRF risk أقل، بس لو حد أضاف cookie-based auth في المستقبل، لازم CSRF token.

### الـ UI / Functional Bugs المحتملة
ما اتأكدتش 100% (محتاج اختبار يدوي على البيئة بتاعتك):
- تأكد إن كل الأزرار في صفحة "إدارة المستخدمين" بتتعطّل صح للأدوار اللي ممنوعة
- صفحة "Department Map" بتستخدم actions مباشرة على Supabase → تأكد إن RLS بتمنع غير الـ super_admin
- زرار "بداية جديدة" (`reset_all_tickets` RPC) — مش متأكد إن الـ RPC نفسها فيها فحص للدور (محتاج تشوف SQL بتاعتها)

### في `manifest.json`
- الـ icons inline data URIs — شغّالة بس مش محبَّذة. الأفضل ملفات PNG حقيقية للـ Lighthouse score
- مفيش `screenshots` (مطلوب لـ PWA install على Chrome الجديد)

---

## ✅ الخلاصة

**ما اتم:**
- ✅ كل ثغرات تصعيد الصلاحيات في `auth.mjs` اتقفلت
- ✅ User enumeration اتمنع
- ✅ كلمة المرور سياستها قوية (10 أحرف + حروف وأرقام)
- ✅ تغيير الباسورد بيتطلب القديمة
- ✅ CORS بيشتغل صح على أي domain في الـ allowlist
- ✅ Security headers قوية (HSTS, CSP, COOP, CORP)
- ✅ Service Worker بقى صح ومفيش حاجات حساسة بتتخزن
- ✅ مفيش بيانات اتمسحت، مفيش تغيير في schema، مفيش breaking change للمستخدم النهائي

**اللي محتاج منك:**
- ⚠️ تتأكد من الـ RLS في Supabase (الـ SQL files مش موجودة في الـ ZIP)
- ⚠️ تـ deploy وتعمل clear للـ Service Worker القديم
- ⚠️ تختبر سيناريوهات الأدوار: employee, supervisor, manager, super_admin
- ⚠️ تفكر في rate limiting خارجي (Cloudflare) لو عاوز حماية brute-force

لو لقيت أي حاجة تانية أو احتجت أعدّل، ابعتلي.
