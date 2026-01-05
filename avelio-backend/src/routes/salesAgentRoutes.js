const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const salesAgentController = require('../controllers/salesAgentController');

// GET all sales agents
router.get('/', requireAuth, salesAgentController.getSalesAgents);

// GET single sales agent
router.get('/:id', requireAuth, salesAgentController.getSalesAgentById);

// CREATE sales agent (manager or admin)
router.post('/', requireAuth, requireRole('manager', 'admin'), salesAgentController.createSalesAgent);

// BULK import sales agents (manager or admin)
router.post('/import', requireAuth, requireRole('manager', 'admin'), salesAgentController.importSalesAgents);

// UPDATE sales agent (manager or admin)
router.put('/:id', requireAuth, requireRole('manager', 'admin'), salesAgentController.updateSalesAgent);

// DELETE sales agent (admin only)
router.delete('/:id', requireAuth, requireRole('admin'), salesAgentController.deleteSalesAgent);

module.exports = router;
