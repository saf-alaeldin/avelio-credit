const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const expenseCodeController = require('../controllers/expenseCodeController');

// GET all expense codes
router.get('/', requireAuth, expenseCodeController.getExpenseCodes);

// GET unique categories
router.get('/categories', requireAuth, expenseCodeController.getExpenseCategories);

// GET single expense code
router.get('/:id', requireAuth, expenseCodeController.getExpenseCodeById);

// CREATE expense code (admin only)
router.post('/', requireAuth, requireRole('admin'), expenseCodeController.createExpenseCode);

// UPDATE expense code (admin only)
router.put('/:id', requireAuth, requireRole('admin'), expenseCodeController.updateExpenseCode);

// Toggle expense code active status (admin only)
router.patch('/:id/toggle', requireAuth, requireRole('admin'), expenseCodeController.toggleExpenseCode);

module.exports = router;
