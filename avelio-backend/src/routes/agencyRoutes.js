// src/routes/agencyRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');

const {
  getAllAgencies,
  createAgency,
  createAgenciesBulk,
} = require('../controllers/agencyController');

// All agency routes require authentication
router.get('/', authenticateToken, getAllAgencies);
router.post('/', authenticateToken, createAgency);
router.post('/bulk', authenticateToken, createAgenciesBulk);

module.exports = router;