// ═══════════════════════════════════════════════════════════
// create-auth-users.mjs
// ينشئ كل users في Supabase Auth مع user_metadata
//
// تشغيل: node create-auth-users.mjs
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://rmlkhgktwologfhphtyz.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY; // من env ← آمن

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY not set');
  console.error('  Run: SUPABASE_SERVICE_KEY=sb_secret_xxx node create-auth-users.mjs');
  process.exit(1);
}

// جلب users الحاليين من public.users
async function getUsers() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,username,name,email,role,department,phone`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch users: ${await res.text()}`);
  return res.json();
}

// إنشاء user في auth.users مع user_metadata
async function createAuthUser(user) {
  const tempPassword = `GAS@${new Date().getFullYear()}!${user.username}`;

  const body = {
    // نفس الـ UUID الموجود في public.users
    // Supabase Admin API يسمح بتحديد الـ ID
    id: user.id,
    email: user.email,
    password: tempPassword,
    email_confirm: true,  // confirmed مباشرة بدون email verification
    user_metadata: {
      // البيانات دي بتيجي في الـ JWT
      username:   user.username,
      name:       user.name,
      role:       user.role,
      department: user.department || '',
      phone:      user.phone || '',
    },
    app_metadata: {
      // app_metadata محمية من التعديل من العميل
      role:       user.role,
      department: user.department || '',
    },
  };

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    // لو user موجود بالفعل → update metadata فقط
    if (data.message?.includes('already') || data.code === 'email_exists') {
      return await updateAuthUserMetadata(user);
    }
    throw new Error(`Failed to create ${user.username}: ${JSON.stringify(data)}`);
  }

  return { action: 'created', user: user.username, tempPassword };
}

// تحديث metadata لـ user موجود
async function updateAuthUserMetadata(user) {
  // أولاً نجيب الـ auth.uid بتاعه عن طريق email
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(user.email)}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });

  const data = await res.json();
  const authUser = data.users?.[0];
  if (!authUser) {
    return { action: 'skipped', user: user.username, reason: 'not found in auth' };
  }

  // Update metadata
  const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUser.id}`, {
    method: 'PUT',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_metadata: {
        username:   user.username,
        name:       user.name,
        role:       user.role,
        department: user.department || '',
      },
      app_metadata: {
        role:       user.role,
        department: user.department || '',
      },
    }),
  });

  if (!updateRes.ok) {
    return { action: 'error', user: user.username, error: await updateRes.text() };
  }

  return { action: 'updated', user: user.username };
}

// Main
async function main() {
  console.log('🚀 Starting Supabase Auth migration...\n');

  const users = await getUsers();
  console.log(`📋 Found ${users.length} users in public.users\n`);

  const results = [];
  const tempPasswords = [];

  for (const user of users) {
    process.stdout.write(`  Processing ${user.username}... `);
    try {
      const result = await createAuthUser(user);
      console.log(`✅ ${result.action}`);
      results.push(result);
      if (result.tempPassword) {
        tempPasswords.push({ username: user.username, email: user.email, tempPassword: result.tempPassword });
      }
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ action: 'error', user: user.username, error: err.message });
    }

    // تأخير صغير لتجنب rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n📊 Results:');
  console.table(results);

  if (tempPasswords.length > 0) {
    console.log('\n🔑 Temporary Passwords (احتفظ بهم وبعتهم للموظفين):');
    console.log('━'.repeat(80));
    for (const { username, email, tempPassword } of tempPasswords) {
      console.log(`  ${username.padEnd(20)} | ${email.padEnd(40)} | ${tempPassword}`);
    }
    console.log('━'.repeat(80));
    console.log('\n⚠️  كل المستخدمين لازم يغيروا كلمة السر من أول دخول!');
  }

  const errors = results.filter(r => r.action === 'error');
  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} errors occurred. Check manually.`);
  } else {
    console.log('\n✅ Migration complete! All users created in Supabase Auth.');
  }
}

main().catch(console.error);
