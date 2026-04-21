# GAS Internal Tickets — German Auto Service
## نظام التيكتات الداخلي · v2.6 (النسخة المستقرة)

نظام كامل للطلبات الداخلية بين إدارات الشركة بنموذج هرمي آمن مع شفافية ذكية.

---

## 🆕 الجديد في v2.6

### 1. دمج "محلول" و "مغلق" → "مغلق"
- حالة واحدة واضحة بدل التكرار
- تقارير أنظف وأبسط
- Migration آمن يحول البيانات القديمة تلقائياً

### 2. عزل الجلسات النشطة حسب الإدارة
- **Super Admin**: يشوف كل المتصلين في النظام
- **مدير الإدارة**: يشوف موظفي إدارته فقط
- عزل على مستوى الـ backend (auth.mjs) — أمان حقيقي مش UI فقط

---

## 🏗️ الأدوار (بدون تغيير)

```
👑 Super Admin → كل الصلاحيات · بدون قيود
🏢 Manager    → إدارة واحدة · سيطرة كاملة داخل إدارته
⭐ Supervisor → مشرف إدارة · بدون حذف
👤 Employee   → موظف · طلباته + المعين عليه + الـ open في إدارته
```

---

## 📊 الحالات الأربع (v2.6)

| الحالة | المعنى | اللون |
|---|---|---|
| 🟦 **مفتوح** (`open`) | طلب جديد لسه ما تم استلامه | أزرق |
| 🟨 **معين** (`assigned`) | تم تعيينه لموظف معين | أصفر |
| 🟧 **قيد التنفيذ** (`in_progress`) | جارٍ العمل عليه | برتقالي |
| ✅ **مغلق** (`closed`) | تم حله وإنهاؤه | رمادي |

---

## 📥 Inbound vs 📤 Outbound

### 📥 طلبات إدارتي (Inbound)
- موجهة لإدارتي · سيطرة كاملة

### 📤 طلبات فريقي الصادرة (Outbound)
- موظفوي بعتوها لإدارات تانية
- عرض + تعليق فقط (متابعة إدارية)

---

## 📂 هيكل المشروع

```
gas-tickets/
├── index.html
├── app.js
├── netlify.toml
├── netlify/functions/auth.mjs
├── supabase-setup.sql
├── supabase-migration-internal.sql         ← v1: الإدارات + المرفقات
├── supabase-migration-roles-v2.sql         ← v2: النظام الهرمي
├── supabase-migration-v3-data-fixes.sql    ← v3: إصلاحات البيانات
├── supabase-migration-v4-merge-statuses.sql ← ⭐ v4: دمج resolved → closed
└── diagnostic.sql
```

---

## 🚀 خطوات التفعيل

### 1️⃣ Supabase — شغل الـ migrations بالترتيب:
```
1) supabase-migration-internal.sql        (v1)
2) supabase-migration-roles-v2.sql        (v2)
3) supabase-migration-v3-data-fixes.sql   (v3)
4) supabase-migration-v4-merge-statuses.sql ⭐ (v4 — جديد)
```

### 2️⃣ Netlify — push → auto-deploy

### 3️⃣ المتصفح — Ctrl+Shift+R لمسح الـ cache

---

## 🎭 اختبار السيناريوهات

### سيناريو 1: دمج الحالات
- افتح تيكت قديم كان "محلول"
- هيظهر دلوقتي "مغلق" ✅
- في الـ dropdown عند المدير، خيار "محلول" مش موجود

### سيناريو 2: عزل الجلسات
1. سجل دخول كـ `Bishoy_Samir` (مدير CRM)
2. في dashboard هتلاقي panel "🟢 الجلسات النشطة"
3. Label تحته: "المستخدمون المتصلون — إدارة CRM"
4. يظهر بس موظفي CRM المتصلين (مش مديرين إدارات تانية)

### سيناريو 3: Inbound/Outbound
1. موظف في CRM يبعت طلب لإدارة الحسابات
2. مدير CRM يروح "📤 طلبات فريقي الصادرة" → يلاقيه
3. يفتحه → Banner أزرق "📤 طلب صادر من فريقك · وضع المتابعة"
4. يقدر يعلق بس مش يحدث الحالة

---

## 🔐 الحسابات الافتراضية

- `ammar.admin` / `admin@2024` ← Super Admin
- `it.admin` / `admin@2024` ← حدد دوره من صفحة "🔑 الأدوار"

---

## 📝 ملاحظات تقنية

### طبقة Perm (مركزية)
```js
Perm.isSuper() / isManager() / isSupervisor() / isEmployee()
Perm.sameDeptAs(t)         // Inbound
Perm.ownerFromMyDept(t)    // Outbound
Perm.isOutbound(t)
Perm.canSeeTicket(t)
Perm.canActOnTicket(t)     // Inbound فقط للقيادات
Perm.canCommentOnTicket(t) // Inbound + Outbound للقيادات
Perm.canAssignTicket(t)
Perm.canDeleteTicket(t)
Perm.canManageUser(u)
Perm.canDeleteUser(u)
Perm.canResetUserPassword(u)
Perm.canSeePage(page)
```

### طبقات الأمان
1. **UI Layer**: الأزرار مخفية حسب الصلاحية
2. **State Layer**: `visibleTickets()` / `visibleUsers()` تفلتر قبل العرض
3. **Backend Layer**: `auth.mjs` يفحص كل عملية حساسة server-side

### التوافق مع البيانات القديمة
- `resolved` القديم يُعرض كـ "مغلق" قبل الـ migration
- بعد v4: كل `resolved` تتحول لـ `closed` في DB
- `admin` القديم يُعامل كـ `supervisor` تلقائياً

---

## 🛠️ Troubleshooting

### "لا توجد طلبات لعرضها" للمدير
- تأكد إن `users.department` مطابق لـ `tickets.target_department`
- شغّل `diagnostic.sql`

### الـ dropdown فاضي
- v4: `resolved` اتشال من dropdown — طبيعي
- لو بيحصل مع حالات تانية، Ctrl+Shift+R

### الجلسات النشطة بتعرض أكتر من اللازم
- تأكد إن الـ deploy الأخير نزل (v2.6+)
- auth.mjs v2.6 بيفلتر server-side

---

**تم التطوير بواسطة عمار — German Auto Service · Mercedes-Benz Egypt**
**v2.6 · Apr 2026**
