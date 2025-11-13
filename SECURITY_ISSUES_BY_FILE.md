# SECURITY ISSUES BY FILE

## authController.js
- **Line 30:** CRITICAL - Default JWT secret fallback
- **Line 54:** MEDIUM - Error message leaks sensitive info
- **Line 65-110:** MEDIUM - No password complexity validation

## authMiddleware.js
- **Line 10:** CRITICAL - No validation that JWT_SECRET is set

## agencyRoutes.js
- **Lines 11-13:** CRITICAL - No authentication on all endpoints

## receiptController.js
- **Lines 17-42:** HIGH - Insufficient input validation
- **Lines 178-244:** HIGH - SQL injection risk (unvalidated filters)
- **Lines 284-341:** HIGH - IDOR on getReceiptById
- **Lines 344-387:** HIGH - IDOR on updateReceiptStatus
- **Lines 390-451:** HIGH - IDOR on voidReceipt

## exportController.js
- **Line 102:** LOW - Missing CSV injection sanitization

## server.js
- **Lines 10-13:** MEDIUM - Missing CORS origin validation
- **Line 51,54:** Code Quality - Duplicate route definition
- **Lines 51-55:** MEDIUM - No security headers implemented
- **General:** Code Quality - No environment variable validation

## db.js
- **Line 54:** MEDIUM - Database query logging includes sensitive data
- **Lines 9-10 (.env file):** HIGH - Database credentials exposed

## pdfGenerator.js
- No critical issues found

## qrcode.js
- No critical issues found

## statsController.js & analyticController.js
- No critical authentication/authorization issues
- But inherits missing rate limiting and general security issues

---

## ISSUE STATISTICS

| Severity | Count | Files |
|----------|-------|-------|
| CRITICAL | 3 | authController, authMiddleware, agencyRoutes |
| HIGH | 5 | receiptController, exportController, db.js |
| MEDIUM | 6 | server.js, db.js, authController |
| LOW | 4 | exportController, authController, server.js |
| Code Quality | 5+ | Multiple files |

**Total Issues Found: 23**

