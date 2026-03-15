const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const analyticController = require('../controllers/analyticController');
const { requireAuth } = require('../middleware/authMiddleware');

// All stats routes require authentication
router.use(requireAuth);

// GET /api/v1/stats/dashboard - Get dashboard summary
router.get('/dashboard', statsController.getDashboardSummary);

// GET /api/v1/stats/today - Get today's stats
router.get('/today', statsController.getTodayStats);

// GET /api/v1/stats/pending - Get pending summary
router.get('/pending', statsController.getPendingSummary);

// GET /api/v1/stats/analytics - Get full analytics (server-side aggregation)
router.get('/analytics', analyticController.getAnalytics);

module.exports = router;