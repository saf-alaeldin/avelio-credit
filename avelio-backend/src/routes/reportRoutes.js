const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const reportController = require('../controllers/reportController');

// GET operations report with filters
// Query params: date_from, date_to, station_id, currency, report_type
router.get('/operations', requireAuth, reportController.getOperationsReport);

// GET agencies report - receipt deposits summary
router.get('/agencies', requireAuth, reportController.getAgenciesReport);

// GET stations list for filter dropdown
router.get('/stations', requireAuth, reportController.getStationsForFilter);

module.exports = router;
