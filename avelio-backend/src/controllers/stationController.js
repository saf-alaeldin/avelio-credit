const db = require('../config/db');
const logger = require('../utils/logger');

// GET all stations
const getStations = async (req, res) => {
  try {
    const { active_only } = req.query;

    let query = 'SELECT * FROM stations';
    const params = [];

    if (active_only === 'true') {
      query += ' WHERE is_active = true';
    }

    query += ' ORDER BY station_code ASC';

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: {
        stations: result.rows.map(s => ({
          id: s.id,
          station_code: s.station_code,
          station_name: s.station_name,
          currencies_allowed: s.currencies_allowed,
          is_active: s.is_active,
          created_at: s.created_at
        }))
      }
    });
  } catch (error) {
    logger.error('Get stations error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stations'
    });
  }
};

// GET single station
const getStationById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM stations WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    res.json({
      success: true,
      data: { station: result.rows[0] }
    });
  } catch (error) {
    logger.error('Get station error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station'
    });
  }
};

// CREATE station (admin only)
const createStation = async (req, res) => {
  try {
    const { station_code, station_name, currencies_allowed } = req.body;

    if (!station_code || !station_name) {
      return res.status(400).json({
        success: false,
        message: 'Station code and name are required'
      });
    }

    // Check for duplicate
    const existing = await db.query(
      'SELECT id FROM stations WHERE station_code = $1',
      [station_code.toUpperCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Station code already exists'
      });
    }

    const result = await db.query(
      `INSERT INTO stations (station_code, station_name, currencies_allowed)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [
        station_code.toUpperCase(),
        station_name,
        currencies_allowed || ['USD', 'SSP']
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Station created successfully',
      data: { station: result.rows[0] }
    });
  } catch (error) {
    logger.error('Create station error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create station'
    });
  }
};

// UPDATE station (admin only)
const updateStation = async (req, res) => {
  try {
    const { id } = req.params;
    const { station_name, currencies_allowed, is_active } = req.body;

    const existing = await db.query(
      'SELECT id FROM stations WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    const result = await db.query(
      `UPDATE stations
       SET station_name = COALESCE($1, station_name),
           currencies_allowed = COALESCE($2, currencies_allowed),
           is_active = COALESCE($3, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [station_name, currencies_allowed, is_active, id]
    );

    res.json({
      success: true,
      message: 'Station updated successfully',
      data: { station: result.rows[0] }
    });
  } catch (error) {
    logger.error('Update station error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update station'
    });
  }
};

// GET sales agents for a station
const getStationAgents = async (req, res) => {
  try {
    const { id } = req.params;
    const { active_only } = req.query;

    let query = `
      SELECT sa.*, s.station_code, s.station_name
      FROM sales_agents sa
      LEFT JOIN stations s ON sa.station_id = s.id
      WHERE sa.station_id = $1
    `;

    if (active_only === 'true') {
      query += ' AND sa.is_active = true';
    }

    query += ' ORDER BY sa.agent_name ASC';

    const result = await db.query(query, [id]);

    res.json({
      success: true,
      count: result.rows.length,
      data: { agents: result.rows }
    });
  } catch (error) {
    logger.error('Get station agents error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station agents'
    });
  }
};

module.exports = {
  getStations,
  getStationById,
  createStation,
  updateStation,
  getStationAgents
};
