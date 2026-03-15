const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const settlementController = require('../controllers/settlementController');
const salesImportController = require('../controllers/salesImportController');

// Multer config for Excel file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel') ||
        file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  },
});

// Sales import from Excel (Till Statement) - must be before /:id routes
router.post('/import/preview', requireAuth, upload.single('file'), salesImportController.previewSalesImport);
router.post('/import/execute', requireAuth, upload.single('file'), salesImportController.executeSalesImport);

// GET all settlements
router.get('/', requireAuth, settlementController.getSettlements);

// GET single settlement with full details
router.get('/:id', requireAuth, settlementController.getSettlementById);

// GET settlement summary (per-currency)
router.get('/:id/summary', requireAuth, settlementController.getSettlementSummary);

// GET settlement agent entries
router.get('/:id/agents', requireAuth, settlementController.getSettlementAgents);

// CREATE agent entry (for missing entries)
router.post('/:id/agents', requireAuth, settlementController.createAgentEntry);

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

// UPDATE expense (admin only)
router.put('/:id/expenses/:expenseId', requireAuth, requireRole('admin'), settlementController.updateExpense);

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

// DELETE agent entry
router.delete('/:id/agents/:agentEntryId', requireAuth, settlementController.deleteAgentEntry);

module.exports = router;
