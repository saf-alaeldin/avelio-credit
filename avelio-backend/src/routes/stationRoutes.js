const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const stationController = require('../controllers/stationController');

// GET all stations
router.get('/', requireAuth, stationController.getStations);

// GET single station
router.get('/:id', requireAuth, stationController.getStationById);

// GET station's sales agents
router.get('/:id/agents', requireAuth, stationController.getStationAgents);

// CREATE station (admin only)
router.post('/', requireAuth, requireRole('admin'), stationController.createStation);

// UPDATE station (admin only)
router.put('/:id', requireAuth, requireRole('admin'), stationController.updateStation);

module.exports = router;
