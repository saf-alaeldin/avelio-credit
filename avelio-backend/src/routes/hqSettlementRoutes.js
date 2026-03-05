const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const hqSettlementController = require('../controllers/hqSettlementController');

// GET expense codes (for dropdown in add expense form)
router.get('/expense-codes', requireAuth, hqSettlementController.getExpenseCodes);

// GET or CREATE Station Summary by date (auto-creates if doesn't exist for admin/manager, view-only for auditor)
router.get('/by-date', requireAuth, requireRole('admin', 'manager', 'auditor'), hqSettlementController.getOrCreateByDate);

// GET all Station Summaries
router.get('/', requireAuth, hqSettlementController.getHQSettlements);

// GET single Station Summary with full details
router.get('/:id', requireAuth, hqSettlementController.getHQSettlementById);

// CREATE new Station Summary
router.post('/', requireAuth, requireRole('admin', 'manager'), hqSettlementController.createHQSettlement);

// ADD expense to Station Summary
router.post('/:id/expenses', requireAuth, requireRole('admin', 'manager'), hqSettlementController.addHQExpense);

// REMOVE expense from Station Summary
router.delete('/:id/expenses/:expenseId', requireAuth, requireRole('admin', 'manager'), hqSettlementController.removeHQExpense);

// ADD income to Station Summary
router.post('/:id/income', requireAuth, requireRole('admin', 'manager'), hqSettlementController.addHQIncome);

// REMOVE income from Station Summary
router.delete('/:id/income/:incomeId', requireAuth, requireRole('admin', 'manager'), hqSettlementController.removeHQIncome);

// RECALCULATE Station Summary (useful when station settlements are updated)
router.post('/:id/recalculate', requireAuth, requireRole('admin', 'manager'), hqSettlementController.recalculateSummary);

// CLOSE Station Summary (DRAFT -> CLOSED)
router.post('/:id/close', requireAuth, requireRole('admin', 'manager'), hqSettlementController.closeHQSettlement);

// DELETE Station Summary (DRAFT only)
router.delete('/:id', requireAuth, requireRole('admin', 'manager'), hqSettlementController.deleteHQSettlement);

module.exports = router;
