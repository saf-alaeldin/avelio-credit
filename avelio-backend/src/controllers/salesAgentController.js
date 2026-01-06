const db = require('../config/db');
const logger = require('../utils/logger');

// GET all sales agents
const getSalesAgents = async (req, res) => {
  try {
    const { station_id, active_only } = req.query;

    let query = `
      SELECT sa.*, s.station_code, s.station_name
      FROM sales_agents sa
      LEFT JOIN stations s ON sa.station_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (station_id) {
      query += ` AND sa.station_id = $${paramIndex++}`;
      params.push(station_id);
    }

    if (active_only === 'true') {
      query += ' AND sa.is_active = true';
    }

    query += ' ORDER BY s.station_code ASC, sa.agent_name ASC';

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: {
        agents: result.rows.map(a => ({
          id: a.id,
          agent_code: a.agent_code,
          agent_name: a.agent_name,
          station_id: a.station_id,
          station_code: a.station_code,
          station_name: a.station_name,
          point_of_sale: a.point_of_sale,
          is_active: a.is_active,
          created_at: a.created_at
        }))
      }
    });
  } catch (error) {
    logger.error('Get sales agents error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales agents'
    });
  }
};

// GET single sales agent
const getSalesAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT sa.*, s.station_code, s.station_name
       FROM sales_agents sa
       LEFT JOIN stations s ON sa.station_id = s.id
       WHERE sa.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales agent not found'
      });
    }

    res.json({
      success: true,
      data: { agent: result.rows[0] }
    });
  } catch (error) {
    logger.error('Get sales agent error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales agent'
    });
  }
};

// CREATE sales agent
const createSalesAgent = async (req, res) => {
  try {
    const { agent_code, agent_name, station_id, point_of_sale } = req.body;

    if (!agent_code || !agent_name) {
      return res.status(400).json({
        success: false,
        message: 'Agent code and name are required'
      });
    }

    // Check for duplicate code
    const existing = await db.query(
      'SELECT id FROM sales_agents WHERE agent_code = $1',
      [agent_code.toUpperCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Agent code already exists'
      });
    }

    // Verify station exists if provided
    if (station_id) {
      const stationCheck = await db.query(
        'SELECT id FROM stations WHERE id = $1',
        [station_id]
      );
      if (stationCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Station not found'
        });
      }
    }

    const result = await db.query(
      `INSERT INTO sales_agents (agent_code, agent_name, station_id, point_of_sale)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [agent_code.toUpperCase(), agent_name, station_id || null, point_of_sale || null]
    );

    // Get station info for response
    const agentWithStation = await db.query(
      `SELECT sa.*, s.station_code, s.station_name
       FROM sales_agents sa
       LEFT JOIN stations s ON sa.station_id = s.id
       WHERE sa.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json({
      success: true,
      message: 'Sales agent created successfully',
      data: { agent: agentWithStation.rows[0] }
    });
  } catch (error) {
    logger.error('Create sales agent error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create sales agent'
    });
  }
};

// UPDATE sales agent
const updateSalesAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { agent_name, station_id, point_of_sale, is_active } = req.body;

    const existing = await db.query(
      'SELECT id FROM sales_agents WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales agent not found'
      });
    }

    // Verify station exists if provided
    if (station_id) {
      const stationCheck = await db.query(
        'SELECT id FROM stations WHERE id = $1',
        [station_id]
      );
      if (stationCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Station not found'
        });
      }
    }

    const result = await db.query(
      `UPDATE sales_agents
       SET agent_name = COALESCE($1, agent_name),
           station_id = COALESCE($2, station_id),
           point_of_sale = COALESCE($3, point_of_sale),
           is_active = COALESCE($4, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [agent_name, station_id, point_of_sale, is_active, id]
    );

    // Get station info for response
    const agentWithStation = await db.query(
      `SELECT sa.*, s.station_code, s.station_name
       FROM sales_agents sa
       LEFT JOIN stations s ON sa.station_id = s.id
       WHERE sa.id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Sales agent updated successfully',
      data: { agent: agentWithStation.rows[0] }
    });
  } catch (error) {
    logger.error('Update sales agent error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update sales agent'
    });
  }
};

// DELETE sales agent (soft delete - set is_active = false)
const deleteSalesAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.query(
      'SELECT id FROM sales_agents WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales agent not found'
      });
    }

    // Check if agent has any sales
    const salesCheck = await db.query(
      'SELECT COUNT(*) FROM station_sales WHERE agent_id = $1',
      [id]
    );

    if (parseInt(salesCheck.rows[0].count) > 0) {
      // Soft delete - just deactivate
      await db.query(
        `UPDATE sales_agents SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );

      return res.json({
        success: true,
        message: 'Sales agent deactivated (has associated sales)'
      });
    }

    // Hard delete if no sales
    await db.query('DELETE FROM sales_agents WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Sales agent deleted successfully'
    });
  } catch (error) {
    logger.error('Delete sales agent error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete sales agent'
    });
  }
};

// BULK import sales agents from CSV data
const importSalesAgents = async (req, res) => {
  try {
    const { agents, station_id } = req.body;

    if (!Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Agents array is required'
      });
    }

    const client = await db.pool.connect();
    const imported = [];
    const errors = [];

    try {
      await client.query('BEGIN');

      for (const agent of agents) {
        try {
          if (!agent.agent_code || !agent.agent_name) {
            errors.push({ agent, error: 'Missing agent_code or agent_name' });
            continue;
          }

          // Check for duplicate
          const existing = await client.query(
            'SELECT id FROM sales_agents WHERE agent_code = $1',
            [agent.agent_code.toUpperCase()]
          );

          if (existing.rows.length > 0) {
            errors.push({ agent, error: 'Agent code already exists' });
            continue;
          }

          const result = await client.query(
            `INSERT INTO sales_agents (agent_code, agent_name, station_id, point_of_sale)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
              agent.agent_code.toUpperCase(),
              agent.agent_name,
              agent.station_id || station_id || null,
              agent.point_of_sale || null
            ]
          );

          imported.push(result.rows[0]);
        } catch (err) {
          errors.push({ agent, error: err.message });
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Imported ${imported.length} agents, ${errors.length} errors`,
        data: {
          imported_count: imported.length,
          error_count: errors.length,
          imported,
          errors
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Import sales agents error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to import sales agents'
    });
  }
};

module.exports = {
  getSalesAgents,
  getSalesAgentById,
  createSalesAgent,
  updateSalesAgent,
  deleteSalesAgent,
  importSalesAgents
};
