const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const stationSalesController = require('../controllers/stationSalesController');

// GET all station sales
router.get('/', requireAuth, stationSalesController.getStationSales);

// GET unsettled sales for a station
router.get('/unsettled', requireAuth, stationSalesController.getUnsettledSales);

// GET sales summary by agent
router.get('/summary', requireAuth, stationSalesController.getSalesSummary);

// GET single sale
router.get('/:id', requireAuth, stationSalesController.getSaleById);

// CREATE single sale (manual entry)
router.post('/', requireAuth, stationSalesController.createSale);

// BULK import sales from CSV
router.post('/import', requireAuth, stationSalesController.importSales);

// UPDATE sale (only if not settled)
router.put('/:id', requireAuth, stationSalesController.updateSale);

// DELETE sale (only if not settled, manager or admin)
router.delete('/:id', requireAuth, requireRole('manager', 'admin'), stationSalesController.deleteSale);

module.exports = router;
