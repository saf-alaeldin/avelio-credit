const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const settlementController = require('../controllers/settlementController');

// GET all settlements
router.get('/', requireAuth, settlementController.getSettlements);

// GET single settlement with full details
router.get('/:id', requireAuth, settlementController.getSettlementById);

// GET settlement summary (per-currency)
router.get('/:id/summary', requireAuth, settlementController.getSettlementSummary);

// GET settlement agent entries
router.get('/:id/agents', requireAuth, settlementController.getSettlementAgents);

// GET settlement expenses
router.get('/:id/expenses', requireAuth, settlementController.getSettlementExpenses);

// CREATE new settlement
router.post('/', requireAuth, settlementController.createSettlement);

// UPDATE declared cash for agent entry
router.put('/:id/agents/:agentEntryId', requireAuth, settlementController.updateAgentDeclaredCash);

// UPDATE station declared cash (for verification against agent total)
router.put('/:id/station-cash', requireAuth, settlementController.updateStationDeclaredCash);

// ADD expense to settlement
router.post('/:id/expenses', requireAuth, settlementController.addExpense);

// REMOVE expense from settlement
router.delete('/:id/expenses/:expenseId', requireAuth, settlementController.removeExpense);

// RECALCULATE settlement (refresh expected cash from sales)
router.post('/:id/recalculate', requireAuth, settlementController.recalculateSettlement);

// SUBMIT settlement for review (DRAFT -> REVIEW)
router.post('/:id/submit', requireAuth, settlementController.submitSettlement);

// APPROVE settlement (REVIEW -> APPROVED) - manager or admin only
router.post('/:id/approve', requireAuth, requireRole('manager', 'admin'), settlementController.approveSettlement);

// REJECT settlement (REVIEW -> DRAFT) - manager or admin only
router.post('/:id/reject', requireAuth, requireRole('manager', 'admin'), settlementController.rejectSettlement);

// CLOSE settlement (APPROVED -> CLOSED) - admin only
router.post('/:id/close', requireAuth, requireRole('admin'), settlementController.closeSettlement);

// DELETE settlement - admin only
router.delete('/:id', requireAuth, requireRole('admin'), settlementController.deleteSettlement);

module.exports = router;
