// ═══════════════════════════════════════════════════════════
// GAS Internal Tickets — Server-Side Rate Limiting Implementation
// Add this to netlify/functions/auth.mjs (after imports, before export)
// ═══════════════════════════════════════════════════════════

/*
⚠️ CRITICAL: This is a TEMPLATE for implementing rate limiting
   You need to:
   1. Create a "rate_limits" table in Supabase (see SQL below)
   2. Add this code to auth.mjs
   3. Deploy to Netlify

NOTE: The current implementation uses in-memory storage (volatile).
      For production, use the Supabase table for persistence across deploys.
*/

// ─── OPTION 1: In-Memory Rate Limiting (Simple, but lost on redeploy) ───
const loginAttempts = new Map(); // key: "ip:username", value: {count, resetTime}

function getClientIP(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
         req.headers.get("cf-connecting-ip") ||
         req.headers.get("x-client-ip") ||
         "unknown";
}

async function checkRateLimit(identifier, maxAttempts = 5, windowSeconds = 900) {
  // identifier: "ip:username" or "ip" or "email"
  // maxAttempts: 5 attempts
  // windowSeconds: 900 = 15 minutes
  
  const now = Date.now();
  const record = loginAttempts.get(identifier);
  
  if (!record) {
    // First attempt
    loginAttempts.set(identifier, {
      count: 1,
      resetTime: now + (windowSeconds * 1000)
    });
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  }
  
  if (now > record.resetTime) {
    // Window expired, reset
    loginAttempts.set(identifier, {
      count: 1,
      resetTime: now + (windowSeconds * 1000)
    });
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  }
  
  // Still within window
  record.count++;
  
  if (record.count > maxAttempts) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfter,
      error: `تم تجاوز حد محاولات الدخول. حاول مجدداً بعد ${retryAfter} ثانية`
    };
  }
  
  return {
    allowed: true,
    remainingAttempts: maxAttempts - record.count
  };
}

function recordFailedAttempt(identifier) {
  // Increment counter for next check
  const record = loginAttempts.get(identifier);
  if (record) record.count++;
}

function clearAttempts(identifier) {
  loginAttempts.delete(identifier);
}

// ─── OPTION 2: Database-Backed Rate Limiting (Recommended for Production) ───
/*
First, create this table in Supabase:

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL UNIQUE,  -- "ip:username" or "ip"
  attempt_count INT DEFAULT 1,
  first_attempt_at TIMESTAMP DEFAULT now(),
  reset_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX idx_rate_limits_reset_at ON rate_limits(reset_at);

-- Auto-cleanup old entries (run daily)
DELETE FROM rate_limits WHERE reset_at < now();
*/

async function checkRateLimitDB(sb_func, identifier, maxAttempts = 5, windowSeconds = 900) {
  // identifier: "ip:username" or "ip"
  const now = new Date();
  const resetTime = new Date(now.getTime() + windowSeconds * 1000);
  
  try {
    // Try to fetch existing limit
    const existing = await sb_func(
      `/rate_limits?identifier=eq.${encodeURIComponent(identifier)}&select=attempt_count,reset_at`
    );
    
    if (existing?.length) {
      const record = existing[0];
      const resetAt = new Date(record.reset_at);
      
      if (now > resetAt) {
        // Window expired, reset
        await sb_func(`/rate_limits?identifier=eq.${encodeURIComponent(identifier)}`, {
          method: "PATCH",
          body: JSON.stringify({
            attempt_count: 1,
            reset_at: resetTime.toISOString()
          })
        });
        return { allowed: true, remainingAttempts: maxAttempts - 1 };
      }
      
      // Still in window
      const newCount = record.attempt_count + 1;
      
      if (newCount > maxAttempts) {
        const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfter,
          error: `تم تجاوز حد محاولات الدخول. حاول مجدداً بعد ${retryAfter} ثانية`
        };
      }
      
      // Increment counter
      await sb_func(`/rate_limits?identifier=eq.${encodeURIComponent(identifier)}`, {
        method: "PATCH",
        body: JSON.stringify({ attempt_count: newCount })
      });
      
      return { allowed: true, remainingAttempts: maxAttempts - newCount };
    }
    
    // No existing record, create one
    await sb_func("/rate_limits", {
      method: "POST",
      body: JSON.stringify({
        identifier,
        attempt_count: 1,
        reset_at: resetTime.toISOString()
      })
    });
    
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  } catch (err) {
    console.error("Rate limit check failed:", err);
    // On error, allow (fail open) but log it
    return { allowed: true, remainingAttempts: maxAttempts, error: null };
  }
}

// ─── INTEGRATION INTO LOGIN ACTION ───
/*
Add this to auth.mjs login action (around line 82):

  if (action === "login") {
    const { username, password } = body;
    if (!username || !password) {
      return Response.json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" }, { status: 400 });
    }
    
    // ✅ NEW: Rate limit check
    const clientIP = getClientIP(req);
    const identifier = `${clientIP}:${username}`;
    const rateCheck = await checkRateLimit(identifier, 5, 900); // 5 attempts in 15 min
    
    if (!rateCheck.allowed) {
      return Response.json({
        error: rateCheck.error,
        retryAfter: rateCheck.retryAfter
      }, {
        status: 429, // Too Many Requests
        headers: { "Retry-After": String(rateCheck.retryAfter) }
      });
    }
    
    // Existing validation
    if (!/^[a-zA-Z0-9._]{3,50}$/.test(username)) {
      recordFailedAttempt(identifier); // Track failed attempt
      return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
    }
    
    // ... rest of login logic ...
    
    // If login fails (wrong password), record attempt:
    if (!users?.length) {
      recordFailedAttempt(identifier);
      return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
    }
    
    // If login succeeds, clear attempts:
    clearAttempts(identifier);
    // ... rest of successful login ...
  }
*/

// ═══════════════════════════════════════════════════════════
// DEPLOYMENT CHECKLIST
// ═══════════════════════════════════════════════════════════

/*
Before deploying this:

1. ✅ Test locally with Netlify dev CLI:
     netlify dev
   
2. ✅ Test rate limiting manually:
     - Try 5+ failed logins with same username
     - Verify 429 response on 6th attempt
     - Verify "Retry-After" header is set
   
3. ✅ Test successful login after rate limit window expires:
     - Wait 15 minutes (or set shorter window for testing)
     - Verify login succeeds
   
4. ✅ Monitor Netlify logs for errors:
     - Check for any database connection issues
     - Verify rate_limits table queries complete quickly
   
5. ✅ Update client app.js to handle 429:
     - Show user-friendly error message
     - Display countdown timer
     - Disable login button during cooldown
   
6. ✅ Document the change in SECURITY-HARDENING-REPORT.js
*/

export {
  checkRateLimit,
  recordFailedAttempt,
  clearAttempts,
  getClientIP,
  checkRateLimitDB
};

