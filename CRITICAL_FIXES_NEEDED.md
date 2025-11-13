# CRITICAL FIXES - IMMEDIATE ACTION REQUIRED

## STOP - DO NOT DEPLOY TO PRODUCTION

This application has **3 CRITICAL security vulnerabilities** that allow complete system compromise.

---

## FIX #1: JWT Secret Default Fallback
**File:** `src/controllers/authController.js` - Line 30  
**Severity:** CRITICAL  
**Time to Fix:** 5 minutes  

**Problem:**
```javascript
process.env.JWT_SECRET || 'your-secret-key-change-this'  // INSECURE!
```

**Fix:**
```javascript
// Add at app startup in server.js
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

// In authController.js, remove the fallback
const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,  // No fallback!
  { expiresIn: '12h' }
);
```

---

## FIX #2: Unprotected Agency Endpoints
**File:** `src/routes/agencyRoutes.js` - Lines 11-13  
**Severity:** CRITICAL  
**Time to Fix:** 2 minutes  

**Problem:**
```javascript
router.get('/', getAllAgencies);           // NO AUTH!
router.post('/', createAgency);            // NO AUTH!
router.post('/bulk', createAgenciesBulk);  // NO AUTH!
```

**Fix:**
```javascript
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, getAllAgencies);
router.post('/', requireAuth, createAgency);
router.post('/bulk', requireAuth, createAgenciesBulk);
```

---

## FIX #3: Insecure Direct Object Reference (IDOR)
**File:** `src/controllers/receiptController.js` - Lines 284-451  
**Severity:** CRITICAL  
**Time to Fix:** 30 minutes  

**Problem:**
Users can access/modify ANY receipt in the system, not just their own.

**Current Code:**
```javascript
const result = await db.query(
  'SELECT * FROM receipts WHERE id = $1',  // No ownership check!
  [id]
);
```

**Fix Pattern:**
```javascript
// Option 1: Simple - check user's station code
const result = await db.query(
  `SELECT r.* FROM receipts r
   WHERE r.id = $1 
   AND r.station_code = $2`,
  [id, req.user.station_code]
);

// Option 2: Better - query user_agencies table
const userAgenciesRes = await db.query(
  'SELECT id FROM agencies WHERE id IN (SELECT agency_id FROM user_agencies WHERE user_id = $1)',
  [req.user.id]
);
const agencyIds = userAgenciesRes.rows.map(r => r.id);

const result = await db.query(
  `SELECT r.* FROM receipts r
   WHERE r.id = $1 AND r.agency_id = ANY($2)`,
  [id, agencyIds]
);

// Check result
if (result.rows.length === 0) {
  return res.status(404).json({ success: false, message: 'Not found or unauthorized' });
}
```

Apply this same fix to:
- `updateReceiptStatus()` function
- `voidReceipt()` function
- `getReceipts()` function (filter results)

---

## QUICK VALIDATION

After fixing these 3 critical issues, verify:

1. **Test without JWT_SECRET env var** - app should fail to start
2. **Test agency endpoints without auth** - should get 401 Unauthorized
3. **Test receipt access** - user from Agency A cannot view Agency B receipts

---

## NEXT PRIORITY FIXES (After Critical)

### HIGH - Fix within 24 hours:

1. **Add Rate Limiting to Login** (src/routes/authRoutes.js)
   - Prevent brute force attacks
   - Max 5 login attempts per 15 minutes

2. **Add Input Validation** (src/controllers/receiptController.js)
   - Validate status enum (PAID, PENDING, VOID)
   - Validate currency and payment_method
   - Set amount max limit

3. **Secure Database Credentials**
   - Use strong random password (not "postgres")
   - Use AWS Secrets Manager or similar

---

## ESTIMATE

- **Critical Fixes:** 30-45 minutes
- **High Priority Fixes:** 2-3 hours
- **Medium Fixes:** 4-5 hours
- **Testing & Verification:** 1-2 hours

**Total Time to Production-Ready:** 6-8 hours (one developer)

---

## TESTING CHECKLIST

After fixes, test:
- [ ] Login works with valid credentials
- [ ] JWT token is required for protected endpoints
- [ ] Invalid JWT returns 401
- [ ] Agency endpoints require authentication
- [ ] Users cannot access other agencies' receipts
- [ ] Rate limiting prevents brute force
- [ ] Invalid input is rejected

---

## DO NOT IGNORE

**This is not a "nice to have"** - the application currently allows:
- Complete authentication bypass
- Unauthorized API access
- Users to modify other agencies' data
- Data integrity violations
- Regulatory violations (GDPR, SOC 2, HIPAA)

**Fix before ANY production deployment.**

