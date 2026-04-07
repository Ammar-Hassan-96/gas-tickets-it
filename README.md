# GAS IT Desk — German Auto Service
## نظام إدارة تيكتات الدعم الفني

### هيكل المشروع
```
gas-it-v2/
├── index.html                    ← الواجهة الرئيسية (SPA)
├── app.js                        ← منطق التطبيق الكامل
├── netlify.toml                  ← إعدادات Netlify
├── netlify/
│   └── functions/
│       └── auth.mjs              ← Netlify Function للمصادقة
└── supabase-setup.sql            ← SQL لإنشاء قاعدة البيانات
```

### خطوات الرفع على Netlify (GitHub)

1. **ارفع المشروع على GitHub**
2. **اربطه بـ Netlify** من app.netlify.com
3. **أضف Environment Variables** في Netlify:
   - `SUPABASE_URL` = `https://rmlkhgktwologfhphtyz.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = [من Supabase Dashboard → Settings → API]

4. **شغّل** `supabase-setup.sql` في Supabase SQL Editor

### بيانات الدخول الأولية
- `ammar.admin` / `admin@GAS2024` ← مدير النظام
- `it.admin` / `admin@GAS2024` ← IT Admin
