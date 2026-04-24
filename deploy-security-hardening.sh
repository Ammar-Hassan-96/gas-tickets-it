#!/bin/bash
# ═════════════════════════════════════════════════════════════
# GAS Internal Tickets — Security Hardening Deployment Script
# Run this to verify and deploy security fixes
# ═════════════════════════════════════════════════════════════

set -e  # Exit on error

echo "🔐 GAS Internal Tickets — Security Hardening Deployment"
echo "═════════════════════════════════════════════════════════"
echo ""

# Step 1: Check Git Status
echo "📋 Step 1: Checking Git Status..."
echo ""
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  Warning: Uncommitted changes detected"
    echo "Please commit or stash changes before deploying"
    exit 1
fi
echo "✅ Git status clean"
echo ""

# Step 2: Verify Files Modified
echo "📋 Step 2: Verifying Modified Files..."
echo ""
files_to_check=(
    "netlify.toml"
    "supabase-rls-hardening-part1.sql"
    "supabase-rls-hardening-part2.sql"
    "supabase-rls-hardening-part3.sql"
)

for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file — Found"
    else
        echo "❌ $file — NOT FOUND"
        exit 1
    fi
done
echo ""

# Step 3: Show Changes
echo "📋 Step 3: Security Headers Changes..."
echo ""
echo "New headers in netlify.toml:"
echo "  • Content-Security-Policy (CSP)"
echo "  • Strict-Transport-Security (HSTS)"
echo "  • X-Frame-Options: DENY"
echo "  • X-Content-Type-Options: nosniff"
echo "  • Referrer-Policy: strict-origin-when-cross-origin"
echo ""

# Step 4: Deployment Instructions
echo "📋 Step 4: Deployment Instructions"
echo "═════════════════════════════════════════════════════════"
echo ""
echo "STEP A: Deploy Security Headers"
echo "  1. git add netlify.toml"
echo "  2. git commit -m 'security: add CSP, HSTS, and security headers'"
echo "  3. git push"
echo "  → Netlify will auto-deploy (2-3 minutes)"
echo ""

echo "STEP B: Verify RLS in Supabase"
echo "  1. Go to Supabase SQL Editor"
echo "  2. Run: SELECT tablename, rowsecurity FROM pg_tables"
echo "         WHERE schemaname = 'public' AND tablename IN"
echo "         ('users','sessions','tickets','ticket_comments',"
echo "          'notifications','department_requests','audit_logs')"
echo "  → All should show rowsecurity = true"
echo ""

echo "STEP C: Test Postman Attack Protection"
echo "  1. Open Postman"
echo "  2. GET https://rmlkhgktwologfhphtyz.supabase.co/rest/v1/users"
echo "  3. Headers:"
echo "     apikey: sb_publishable_g3HM0Y7GIM2A72f63Y74UA_1eJxH7dF"
echo "     Authorization: Bearer sb_publishable_g3HM0Y7GIM2A72f63Y74UA_1eJxH7dF"
echo "  → Expected: 200 OK with [] (empty array)"
echo "  → ✅ If empty, attack is blocked!"
echo ""

echo "STEP D: Test Valid Session"
echo "  1. Open app in browser"
echo "  2. Login normally"
echo "  3. Open DevTools → Network"
echo "  4. Make a request (load tickets)"
echo "  5. Check request headers → x-session-token should be present"
echo "  → ✅ If present and data loads, app works correctly!"
echo ""

echo "═════════════════════════════════════════════════════════"
echo "✅ Deployment Checklist Complete"
echo ""
echo "Ready to deploy? (y/n)"
read -r response
if [ "$response" != "y" ]; then
    echo "Deployment cancelled."
    exit 0
fi

# Step 5: Deploy
echo ""
echo "🚀 Deploying..."
git add netlify.toml
git commit -m "security: add CSP, HSTS, and security headers for RLS hardening"
git push

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "Next Steps:"
echo "  1. Wait 2-3 minutes for Netlify deploy to finish"
echo "  2. Run Step C above to verify Postman attack is blocked"
echo "  3. Run Step D above to verify app still works"
echo "  4. Review SECURITY-HARDENING-REPORT.js for full details"
echo ""
echo "Questions? See:"
echo "  📄 INCIDENT-RESOLUTION-REPORT.js — Incident closure details"
echo "  📄 SECURITY-HARDENING-REPORT.js — Vulnerabilities & recommendations"
echo "  📄 supabase-rls-attack-test-comprehensive.sql — Detailed test scenarios"
echo ""
