const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const hqSettlementController = require('../controllers/hqSettlementController');

// GET all HQ settlements
router.get('/', requireAuth, hqSettlementController.getHQSettlements);

// GET single HQ settlement with full details
router.get('/:id', requireAuth, hqSettlementController.getHQSettlementById);

// GET available station settlements for a date range
router.get('/:id/available-stations', requireAuth, hqSettlementController.getAvailableStationSettlements);

// CREATE new HQ settlement
router.post('/', requireAuth, requireRole('admin', 'manager'), hqSettlementController.createHQSettlement);

// ADD station settlement to HQ settlement
router.post('/:id/stations', requireAuth, requireRole('admin', 'manager'), hqSettlementController.addStationSettlement);

// REMOVE station settlement from HQ settlement
router.delete('/:id/stations/:stationSettlementId', requireAuth, requireRole('admin', 'manager'), hqSettlementController.removeStationSettlement);

// ADD expense to HQ settlement
router.post('/:id/expenses', requireAuth, requireRole('admin', 'manager'), hqSettlementController.addHQExpense);

// REMOVE expense from HQ settlement
router.delete('/:id/expenses/:expenseId', requireAuth, requireRole('admin', 'manager'), hqSettlementController.removeHQExpense);

// SUBMIT HQ settlement for review (DRAFT -> REVIEW)
router.post('/:id/submit', requireAuth, requireRole('admin', 'manager'), hqSettlementController.submitHQSettlement);

// APPROVE HQ settlement (REVIEW -> APPROVED) - admin only
router.post('/:id/approve', requireAuth, requireRole('admin'), hqSettlementController.approveHQSettlement);

// REJECT HQ settlement (REVIEW -> DRAFT) - admin only
router.post('/:id/reject', requireAuth, requireRole('admin'), hqSettlementController.rejectHQSettlement);

// CLOSE HQ settlement (APPROVED -> CLOSED) - admin only
router.post('/:id/close', requireAuth, requireRole('admin'), hqSettlementController.closeHQSettlement);

// DELETE HQ settlement (DRAFT only)
router.delete('/:id', requireAuth, requireRole('admin', 'manager'), hqSettlementController.deleteHQSettlement);

module.exports = router;
