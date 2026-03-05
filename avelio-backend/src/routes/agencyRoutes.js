// src/routes/agencyRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');

const {
  getAllAgencies,
  createAgency,
  createAgenciesBulk,
  getAgencyStats,
} = require('../controllers/agencyController');

// All agency routes require authentication
router.get('/', authenticateToken, getAllAgencies);
router.get('/:agency_id/stats', authenticateToken, getAgencyStats);
router.post('/', authenticateToken, createAgency);
router.post('/bulk', authenticateToken, createAgenciesBulk);

module.exports = router;