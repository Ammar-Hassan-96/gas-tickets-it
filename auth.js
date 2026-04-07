// ═══════════════════════════════════════════════════════
// GAS IT Desk — Auth Function
// German Auto Service · Mercedes-Benz Egypt
// ═══════════════════════════════════════════════════════
const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function supabaseFetch(url, key, path, options = {}) {
  const resp = await fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!resp.ok) throw new Error(`Supabase error: ${resp.status}`);
  return resp.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    if (action === 'login') {
      const { username, password } = body;
      if (!username || !password) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' }) };
      }

      const passHash = sha256(password);

      const users = await supabaseFetch(SUPABASE_URL, SUPABASE_KEY,
        `/users?username=eq.${encodeURIComponent(username)}&password_hash=eq.${passHash}&is_active=eq.true&select=id,name,username,email,role,department`
      );

      if (!users || users.length === 0) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }) };
      }

      const user = users[0];
      const token = generateToken();

      // Store session in sessions table (optional)
      try {
        await supabaseFetch(SUPABASE_URL, SUPABASE_KEY, '/sessions', {
          method: 'POST',
          body: JSON.stringify({
            user_id: user.id,
            token: sha256(token),
            expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
          })
        });
      } catch(e) { /* sessions table optional */ }

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ user, token })
      };
    }

    if (action === 'validate') {
      const { token } = body;
      if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No token' }) };

      const tokenHash = sha256(token);
      try {
        const sessions = await supabaseFetch(SUPABASE_URL, SUPABASE_KEY,
          `/sessions?token=eq.${tokenHash}&expires_at=gt.${new Date().toISOString()}&select=user_id`
        );
        if (!sessions || !sessions.length) throw new Error('invalid');

        const users = await supabaseFetch(SUPABASE_URL, SUPABASE_KEY,
          `/users?id=eq.${sessions[0].user_id}&select=id,name,username,email,role,department`
        );
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ user: users[0] }) };
      } catch(e) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid session' }) };
      }
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch(err) {
    console.error('Auth error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server error' }) };
  }
};
