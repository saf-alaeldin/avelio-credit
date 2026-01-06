const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { requireAuth } = require('../middleware/authMiddleware');

// All export routes require authentication
router.use(requireAuth);

// GET /api/v1/export/receipts - Export receipts to CSV
router.get('/receipts', exportController.exportToCSV);

// GET /api/v1/export/summary - Export summary by agency to CSV
router.get('/summary', exportController.exportSummaryCSV);

// GET /api/v1/export/daily-summary - Export daily receipts summary as PDF
router.get('/daily-summary', exportController.exportDailySummaryPDF);

// GET /api/v1/export/monthly-summary - Export monthly receipts summary as PDF
router.get('/monthly-summary', exportController.exportMonthlySummaryPDF);

// GET /api/v1/export/cash-closing - Get cash closing data for reports
router.get('/cash-closing', exportController.getCashClosingData);

// GET /api/v1/export/sales-settlements - Export comprehensive sales and settlements report as PDF
router.get('/sales-settlements', exportController.exportSalesSettlementsReport);

module.exports = router;