# 🚨 دليل الطوارئ — إغلاق الثغرة الأمنية
## GAS Internal Tickets — خطوات التنفيذ الفوري

---

## ⚠️ الوضع الحالي
الهكر معاه مفتاح Supabase ويقدر يتحكم في قاعدة البيانات. لكن بعد تطبيق الخطوات دي، قاعدة البيانات هتكون محمية بـ **RLS** (Row-Level Security) والمفتاح هيبقى عديم القيمة بدون session token صحيحة.

**الثغرات اللي اتصلحت:**
1. 🔴 أي موظف كان يقدر يخلي نفسه `manager` أو `supervisor` → **اتقفلت**
2. 🔴 أي مستخدم مصدّق كان يشوف كل المستخدمين وأدوارهم → **اتقفلت**
3. 🔴 الـ `users_select` policy كانت سمحانة جداً → **اتصلحت**
4. 🟡 المفتاح العام (publishable key) → لسه متعرض لكن RLS بيحمي دلوقتي

---

## 🔴 الخطوة 1: تطبيق RLS Lockdown (أولوية قصوى)

### أ. افتح Supabase Dashboard
روح على: https://supabase.com/dashboard → مشروعك

### ب. افتح SQL Editor
- من الشمال اضغط على **SQL Editor**
- اعمل **New Query**

### ج. شغّل `emergency-rls-lockdown.sql`
- افتح الملف ده من الكمبيوتر: `emergency-rls-lockdown.sql`
- انسخ كل المحتوى
- الصقه في SQL Editor
- اضغط **Run**

**المفروض ترجع لك رسالة:**
```
✅ RLS ENABLED على كل الجداول
✅ NO allow_all policies remaining
helper_functions_count: 11
```

لو ظهر أي `🔴 RLS DISABLED` → شغّل الملف تاني.

---

## 🔴 الخطوة 2: قتل كل الجلسات (Kill All Sessions)

### شغّل `emergency-session-kill.sql`
- نفس الطريقة: SQL Editor → New Query
- انسخ محتوى `emergency-session-kill.sql`
- اضغط **Run**

**ده هي:**
- ☠️ يمسح **كل** الجلسات النشطة (sessions)
- الهكر لو معاه token صالح → هيتلغي فوراً
- كل المستخدمين (حتى الشرعيين) هيتسجل خروجهم
- لازم الكل يدخل من تاني

**المفروض ترجع:**
```
✅ ALL SESSIONS KILLED
sessions_killed: [رقم]
users_affected: [رقم]
```

---

## 🔴 الخطوة 3: تفتيش الحسابات (Backdoor Audit)

### شغّل `emergency-backdoor-audit.sql`
- SQL Editor → New Query
- انسخ محتوى `emergency-backdoor-audit.sql`
- اضغط **Run**

**ابحث عن:**
- 🔴 `UNAUTHORIZED super_admin` — أي super_admin غير `ammar.admin`
- 🔴 `Duplicate ammar.admin` — لو فيه أكتر من حساب بنفس الاسم
- ⚠️ حسابات اتعملت في آخر 7 أيام (مش معروفة)
- ⚠️ حسابات اتعدلت في آخر 7 أيام (role escalation)

### لو لقيت حساب مشبوه:
في نفس الملف في آخر جزء (`REMEDIATION QUERIES`)، شيل `--` من قدام الـ query المناسبة:

```sql
-- عشان تعطل حساب:
UPDATE public.users SET is_active = false, updated_at = now()
WHERE username = 'USERNAME_الهكر';

-- عشان تنزل دوره من super_admin لـ employee:
UPDATE public.users SET role = 'employee', updated_at = now()
WHERE username = 'USERNAME_الهكر' AND role = 'super_admin';
```

---

## 🔴 الخطوة 4: تدوير المفاتيح (Key Rotation)

### أ. Supabase Anon Key (المفتاح اللي الهكر معاه)
1. في Supabase Dashboard → Settings (الترس) → API
2. تحت `Project API keys`
3. اضغط على `Reveal` جنب **anon public**
4. اضغط `Generate a new secret`
5. انسخ المفتاح الجديد

### ب. Supabase Service Role Key (أهم مفتاح)
1. في نفس الصفحة (Settings → API)
2. تحت `Service role secret`
3. اضغط `Reveal` → `Generate a new secret`
4. **ده أهم خطوة** — المفتاح ده بيتجاوز كل RLS

### ج. حدّث Netlify Environment Variables
1. روح على Netlify Dashboard → موقعك → Site settings → Environment variables
2. حدّث:
   - `SUPABASE_URL` = نفس اللينك (ماتغيرش)
   - `SUPABASE_ANON_KEY` = المفتاح الجديد (اللي نسخته من الخطوة أ)
   - `SUPABASE_SERVICE_ROLE_KEY` = المفتاح الجديد (اللي نسخته من الخطوة ب)

---

## 🔴 الخطوة 5: نشر التحديثات

### أ. في الكمبيوتر (VS Code Terminal):
```bash
git add -A
git commit -m "security: emergency RLS lockdown + session kill + key rotation"
git push
```

### ب. في Netlify:
- التحديث هينشر تلقائياً بعد الـ push
- استنى 2-3 دقايق
- تأكد إن الـ deploy نجح (Build log ما فيهوش errors)

---

## 🔴 الخطوة 6: اختبار سريع

### اختبار 1: Postman Attack
1. افتح Postman
2. اعمل **GET** request للرابط ده:
   ```
   https://rmlkhgktwologfhphtyz.supabase.co/rest/v1/users?limit=10
   ```
3. في **Headers** ضيف:
   ```
   apikey: [المفتاح الجديد]
   Authorization: Bearer [المفتاح الجديد]
   ```
4. **ماتحطش** `x-session-token`
5. اضغط Send

**المفروض يرجع:** `[]` (مصفوفة فاضية) ✅

**لو رجع بيانات:** 🔴 RLS مش شغال — راجع الخطوة 1

### اختبار 2: Login من التطبيق
1. افتح التطبيق في المتصفح
2. سجّل دخول بحساب عادي (employee)
3. افتح Developer Tools → Network
4. تأكد إن كل request فيه header:
   ```
   x-session-token: [token طويل]
   ```
5. التطبيق يشتغل عادي

### اختبار 3: Role Escalation (من Console)
1. بعد ما تسجّل دخول كـ employee
2. افتح Console (F12 → Console)
3. جرّب:
   ```js
   await sbFetch('/users?id=eq.' + S.user.id, {
     method: 'PATCH',
     body: JSON.stringify({ role: 'manager' })
   })
   ```
4. **المفروض يرجع Error** (403 Forbidden) ✅

---

## 🔴 الخطوة 7: إشعار الفريق

### غيّر كلمة مرور `ammar.admin`
- من التطبيق → صفحة المستخدمين → عدّل باسورد الحساب الرئيسي
- أو من SQL Editor:
  ```sql
  UPDATE public.users
  SET password_hash = encode(sha256('YOUR_NEW_PASSWORD'::bytea), 'hex'),
      updated_at = now()
  WHERE username = 'ammar.admin';
  ```

### أبلغ الفريق:
```
🔴 تنبيه أمني: تم اكتشاف محاولة اختراق.

اللي اتعمل:
✅ قاعدة البيانات محمية بـ RLS
✅ كل الجلسات اتقتلت
✅ المفاتيح اتغيرت

المطلوب منك:
1. سجّل دخول من جديد بالتطبيق
2. غيّر باسوردك الفوري
3. لو لاحظت أي نشاط مشبوه → بلّغني فوراً
```

---

## 📋 قائمة الملفات الجديدة

| الملف | الغرض |
|-------|-------|
| `emergency-rls-lockdown.sql` | تطبيق RLS محكم على كل الجداول |
| `emergency-session-kill.sql` | مسح كل الجلسات النشطة |
| `emergency-backdoor-audit.sql` | البحث عن حسابات غير مصرح بها |
| `TODO.md` | قائمة المهام المحدثة |
| `EMERGENCY-DEPLOYMENT-GUIDE.md` | الدليل ده |

---

## 🆘 لو حاجة مشتغلتش

### مشكلة: التطبيق بيرجع "no rows" لكل حاجة
**السبب:** RLS شغال بس الـ `x-session-token` مش بيتبعت
**الحل:**
1. تأكد إن `app.js` المحدث منشور
2. تأكد إن المستخدم سجّل دخول (token موجود في localStorage)
3. افتح Console واكتب: `localStorage.getItem('gas_it_session')`
   - لو رجع `null` → المستخدم مش مسجّل دخول
   - لو رجع object فيه `token` → المفروض يشتغل

### مشكلة: Postman Attack لسه بيرجع بيانات
**السبب:** RLS مش متطبق صح
**الحل:**
1. راجع `emergency-rls-lockdown.sql` شغّله تاني
2. تأكد إن الجداول كلها `rls enabled`
3. شغّل الـ verification query في آخر الملف

### مشكلة: المستخدمين الشرعيين مش قادرين يدخلوا
**السبب:** Sessions اتقتلت (ده المطلوب)
**الحل:** كل المستخدمين لازم يدخلوا من جديد — ده طبيعي

---

## ✅ بعد ما تخلص كل الخطوات

```
✅ RLS Lockdown applied
✅ All sessions killed
✅ Backdoor audit completed
✅ Keys rotated
✅ App redeployed
✅ Team notified
```

**النظام دلوقتي محمي. الهكر حتى لو معاه المفتاح القديم:**
- ❌ مقدرش يشوف أي بيانات (RLS بيحظر)
- ❌ مقدرش يعدّل صلاحيات (RLS بيحظر)
- ❌ الـ token بتاعه اتلغى (sessions اتقتلت)
- ❌ المفتاح القديم بقى غير صالح (اتدوّر)

---

**آخر تحديث:** 2026-04-24
**الحالة:** 🔴 إجراءات طوارئ جاهزة للتنفيذ

