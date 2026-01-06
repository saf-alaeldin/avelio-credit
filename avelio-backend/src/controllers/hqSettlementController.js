const db = require('../config/db');
const logger = require('../utils/logger');

// Helper: Log HQ settlement action
async function logHQSettlementAction(client, hqSettlementId, userId, action, fieldChanged, oldValue, newValue, notes, ipAddress) {
  try {
    await client.query(
      `INSERT INTO hq_settlement_audit_logs
       (hq_settlement_id, user_id, action, field_changed, old_value, new_value, notes, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        hqSettlementId,
        userId,
        action,
        fieldChanged || null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        notes || null,
        ipAddress || null
      ]
    );
  } catch (error) {
    logger.error('HQ Settlement audit log error:', { error: error.message });
  }
}

// Helper: Calculate HQ settlement summary
async function calculateHQSettlementSummary(client, hqSettlementId) {
  // Get all station settlements linked to this HQ settlement
  const stationSettlements = await client.query(
    `SELECT ss.*, s.station_code, s.station_name
     FROM hq_settlement_stations hss
     JOIN settlements ss ON hss.station_settlement_id = ss.id
     JOIN stations s ON ss.station_id = s.id
     WHERE hss.hq_settlement_id = $1`,
    [hqSettlementId]
  );

  // Get unique currencies from all station settlements
  const currenciesResult = await client.query(
    `SELECT DISTINCT ssum.currency
     FROM hq_settlement_stations hss
     JOIN settlement_summaries ssum ON hss.station_settlement_id = ssum.settlement_id
     WHERE hss.hq_settlement_id = $1`,
    [hqSettlementId]
  );

  for (const { currency } of currenciesResult.rows) {
    // Aggregate station settlement summaries
    const stationSummary = await client.query(
      `SELECT
         COUNT(DISTINCT ssum.settlement_id) as stations_count,
         COALESCE(SUM(ssum.expected_cash), 0) as total_expected,
         COALESCE(SUM(ssum.actual_cash_received), 0) as total_actual,
         COALESCE(SUM(ssum.total_expenses), 0) as total_expenses,
         COALESCE(SUM(ssum.expected_net_cash), 0) as total_net
       FROM hq_settlement_stations hss
       JOIN settlement_summaries ssum ON hss.station_settlement_id = ssum.settlement_id
       WHERE hss.hq_settlement_id = $1 AND ssum.currency = $2`,
      [hqSettlementId, currency]
    );

    // Get HQ-level expenses
    const hqExpenses = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_hq_expenses
       FROM hq_settlement_expenses
       WHERE hq_settlement_id = $1 AND currency = $2`,
      [hqSettlementId, currency]
    );

    const stationData = stationSummary.rows[0];
    const hqExpensesTotal = parseFloat(hqExpenses.rows[0].total_hq_expenses);

    const totalStationExpected = parseFloat(stationData.total_expected);
    const totalStationActual = parseFloat(stationData.total_actual);
    const totalStationExpenses = parseFloat(stationData.total_expenses);
    const totalStationNet = parseFloat(stationData.total_net);

    // Grand totals (include HQ expenses)
    const grandExpected = totalStationExpected;
    const grandActual = totalStationActual;
    const grandNet = totalStationNet - hqExpensesTotal;
    const finalVariance = grandActual - grandNet;

    // Determine variance status
    let varianceStatus = 'PENDING';
    if (stationData.stations_count > 0) {
      if (finalVariance === 0) {
        varianceStatus = 'BALANCED';
      } else if (finalVariance < 0) {
        varianceStatus = 'SHORT';
      } else {
        varianceStatus = 'EXTRA';
      }
    }

    // Upsert summary
    await client.query(
      `INSERT INTO hq_settlement_summaries
       (hq_settlement_id, currency, total_stations_count,
        total_station_expected_cash, total_station_actual_cash, total_station_expenses, total_station_net_cash,
        total_hq_expenses, grand_expected_cash, grand_actual_cash, grand_net_cash,
        final_variance, variance_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (hq_settlement_id, currency)
       DO UPDATE SET
         total_stations_count = EXCLUDED.total_stations_count,
         total_station_expected_cash = EXCLUDED.total_station_expected_cash,
         total_station_actual_cash = EXCLUDED.total_station_actual_cash,
         total_station_expenses = EXCLUDED.total_station_expenses,
         total_station_net_cash = EXCLUDED.total_station_net_cash,
         total_hq_expenses = EXCLUDED.total_hq_expenses,
         grand_expected_cash = EXCLUDED.grand_expected_cash,
         grand_actual_cash = EXCLUDED.grand_actual_cash,
         grand_net_cash = EXCLUDED.grand_net_cash,
         final_variance = EXCLUDED.final_variance,
         variance_status = EXCLUDED.variance_status,
         updated_at = CURRENT_TIMESTAMP`,
      [
        hqSettlementId,
        currency,
        parseInt(stationData.stations_count),
        totalStationExpected,
        totalStationActual,
        totalStationExpenses,
        totalStationNet,
        hqExpensesTotal,
        grandExpected,
        grandActual,
        grandNet,
        finalVariance,
        varianceStatus
      ]
    );
  }
}

// GET all HQ settlements
const getHQSettlements = async (req, res) => {
  try {
    const { status, date_from, date_to, page = 1, pageSize = 20 } = req.query;

    let query = `
      SELECT hs.*, u1.name as created_by_name, u2.name as reviewed_by_name
      FROM hq_settlements hs
      LEFT JOIN users u1 ON hs.created_by = u1.id
      LEFT JOIN users u2 ON hs.reviewed_by = u2.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND hs.status = $${paramIndex++}`;
      params.push(status);
    }

    if (date_from) {
      query += ` AND hs.period_from >= $${paramIndex++}`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND hs.period_to <= $${paramIndex++}`;
      params.push(date_to);
    }

    // Count total
    const countQuery = query.replace(/SELECT hs\.\*[\s\S]*?FROM hq_settlements hs/, 'SELECT COUNT(*) FROM hq_settlements hs');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    query += ` ORDER BY hs.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(pageSize), offset);

    const result = await db.query(query, params);

    // Get summaries for each HQ settlement
    const settlements = [];
    for (const row of result.rows) {
      const summaries = await db.query(
        `SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1`,
        [row.id]
      );

      const stationsCount = await db.query(
        `SELECT COUNT(*) FROM hq_settlement_stations WHERE hq_settlement_id = $1`,
        [row.id]
      );

      settlements.push({
        ...row,
        stations_count: parseInt(stationsCount.rows[0].count),
        summaries: summaries.rows
      });
    }

    res.json({
      success: true,
      count: settlements.length,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      data: settlements
    });
  } catch (error) {
    logger.error('Get HQ settlements error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch HQ settlements'
    });
  }
};

// GET single HQ settlement with full details
const getHQSettlementById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get HQ settlement
    const result = await db.query(
      `SELECT hs.*, u1.name as created_by_name, u2.name as submitted_by_name, u3.name as reviewed_by_name
       FROM hq_settlements hs
       LEFT JOIN users u1 ON hs.created_by = u1.id
       LEFT JOIN users u2 ON hs.submitted_by = u2.id
       LEFT JOIN users u3 ON hs.reviewed_by = u3.id
       WHERE hs.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'HQ Settlement not found'
      });
    }

    const hqSettlement = result.rows[0];

    // Get station settlements
    const stationSettlements = await db.query(
      `SELECT hss.id as link_id, s.*, st.station_code, st.station_name
       FROM hq_settlement_stations hss
       JOIN settlements s ON hss.station_settlement_id = s.id
       JOIN stations st ON s.station_id = st.id
       WHERE hss.hq_settlement_id = $1
       ORDER BY st.station_name`,
      [id]
    );

    // Get station summaries for each
    for (let i = 0; i < stationSettlements.rows.length; i++) {
      const stationSummaries = await db.query(
        `SELECT * FROM settlement_summaries WHERE settlement_id = $1`,
        [stationSettlements.rows[i].id]
      );
      stationSettlements.rows[i].summaries = stationSummaries.rows;
    }

    // Get HQ expenses
    const expenses = await db.query(
      `SELECT he.*, ec.code as expense_code, ec.name as expense_name, ec.category, u.name as created_by_name
       FROM hq_settlement_expenses he
       JOIN expense_codes ec ON he.expense_code_id = ec.id
       LEFT JOIN users u ON he.created_by = u.id
       WHERE he.hq_settlement_id = $1
       ORDER BY he.created_at DESC`,
      [id]
    );

    // Get HQ summaries
    const summaries = await db.query(
      `SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1 ORDER BY currency`,
      [id]
    );

    // Get audit logs
    const auditLogs = await db.query(
      `SELECT hal.*, u.name as user_name
       FROM hq_settlement_audit_logs hal
       LEFT JOIN users u ON hal.user_id = u.id
       WHERE hal.hq_settlement_id = $1
       ORDER BY hal.created_at DESC
       LIMIT 50`,
      [id]
    );

    res.json({
      success: true,
      data: {
        hq_settlement: {
          ...hqSettlement,
          station_settlements: stationSettlements.rows,
          expenses: expenses.rows,
          summaries: summaries.rows,
          audit_logs: auditLogs.rows
        }
      }
    });
  } catch (error) {
    logger.error('Get HQ settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch HQ settlement'
    });
  }
};

// CREATE new HQ settlement
const createHQSettlement = async (req, res) => {
  try {
    const { period_from, period_to } = req.body;
    const userId = req.user.id;

    if (!period_from || !period_to) {
      return res.status(400).json({
        success: false,
        message: 'period_from and period_to are required'
      });
    }

    if (new Date(period_from) > new Date(period_to)) {
      return res.status(400).json({
        success: false,
        message: 'period_from must be before or equal to period_to'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate settlement number
      const settlementNumber = await client.query(
        'SELECT generate_hq_settlement_number($1) as number',
        [period_from]
      );

      // Create HQ settlement
      const result = await client.query(
        `INSERT INTO hq_settlements (settlement_number, period_from, period_to, status, created_by)
         VALUES ($1, $2, $3, 'DRAFT', $4)
         RETURNING *`,
        [settlementNumber.rows[0].number, period_from, period_to, userId]
      );

      const hqSettlement = result.rows[0];

      // Log action
      await logHQSettlementAction(
        client,
        hqSettlement.id,
        userId,
        'CREATE',
        null,
        null,
        { settlement_number: hqSettlement.settlement_number, period_from, period_to },
        'HQ Settlement created',
        req.ip
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'HQ Settlement created successfully',
        data: { hq_settlement: hqSettlement }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Create HQ settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create HQ settlement'
    });
  }
};

// ADD station settlement to HQ settlement
const addStationSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { station_settlement_id } = req.body;
    const userId = req.user.id;

    if (!station_settlement_id) {
      return res.status(400).json({
        success: false,
        message: 'station_settlement_id is required'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify HQ settlement exists and is in DRAFT status
      const hqSettlement = await client.query(
        'SELECT * FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'HQ Settlement not found'
        });
      }

      if (hqSettlement.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only add stations to DRAFT HQ settlements'
        });
      }

      // Verify station settlement exists and is APPROVED or CLOSED
      const stationSettlement = await client.query(
        `SELECT s.*, st.station_code, st.station_name
         FROM settlements s
         JOIN stations st ON s.station_id = st.id
         WHERE s.id = $1`,
        [station_settlement_id]
      );

      if (stationSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Station settlement not found'
        });
      }

      if (!['APPROVED', 'CLOSED'].includes(stationSettlement.rows[0].status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Only APPROVED or CLOSED station settlements can be added'
        });
      }

      // Check if already linked
      const existingLink = await client.query(
        `SELECT id FROM hq_settlement_stations
         WHERE hq_settlement_id = $1 AND station_settlement_id = $2`,
        [id, station_settlement_id]
      );

      if (existingLink.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Station settlement is already in this HQ settlement'
        });
      }

      // Add link
      await client.query(
        `INSERT INTO hq_settlement_stations (hq_settlement_id, station_settlement_id)
         VALUES ($1, $2)`,
        [id, station_settlement_id]
      );

      // Recalculate summary
      await calculateHQSettlementSummary(client, id);

      // Log action
      await logHQSettlementAction(
        client,
        id,
        userId,
        'ADD_STATION',
        null,
        null,
        {
          station_settlement_id,
          station_code: stationSettlement.rows[0].station_code,
          settlement_number: stationSettlement.rows[0].settlement_number
        },
        `Added station settlement ${stationSettlement.rows[0].settlement_number}`,
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Station settlement added successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Add station settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to add station settlement'
    });
  }
};

// REMOVE station settlement from HQ settlement
const removeStationSettlement = async (req, res) => {
  try {
    const { id, stationSettlementId } = req.params;
    const userId = req.user.id;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify HQ settlement exists and is in DRAFT status
      const hqSettlement = await client.query(
        'SELECT status FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'HQ Settlement not found'
        });
      }

      if (hqSettlement.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only remove stations from DRAFT HQ settlements'
        });
      }

      // Remove link
      const result = await client.query(
        `DELETE FROM hq_settlement_stations
         WHERE hq_settlement_id = $1 AND station_settlement_id = $2
         RETURNING *`,
        [id, stationSettlementId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Station settlement link not found'
        });
      }

      // Recalculate summary
      await calculateHQSettlementSummary(client, id);

      // Log action
      await logHQSettlementAction(
        client,
        id,
        userId,
        'REMOVE_STATION',
        null,
        { station_settlement_id: stationSettlementId },
        null,
        'Removed station settlement',
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Station settlement removed successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Remove station settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to remove station settlement'
    });
  }
};

// ADD HQ expense
const addHQExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { expense_code_id, currency, amount, description } = req.body;
    const userId = req.user.id;

    if (!expense_code_id || !currency || !amount) {
      return res.status(400).json({
        success: false,
        message: 'expense_code_id, currency, and amount are required'
      });
    }

    if (parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify HQ settlement exists and is in DRAFT status
      const hqSettlement = await client.query(
        'SELECT status FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'HQ Settlement not found'
        });
      }

      if (hqSettlement.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only add expenses to DRAFT HQ settlements'
        });
      }

      // Verify expense code
      const expenseCode = await client.query(
        'SELECT * FROM expense_codes WHERE id = $1 AND is_active = true',
        [expense_code_id]
      );

      if (expenseCode.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Invalid expense code'
        });
      }

      // Check currency is allowed
      if (!expenseCode.rows[0].currencies_allowed.includes(currency)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Expense code does not allow ${currency} currency`
        });
      }

      // Add expense
      const result = await client.query(
        `INSERT INTO hq_settlement_expenses (hq_settlement_id, expense_code_id, currency, amount, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, expense_code_id, currency, parseFloat(amount), description || null, userId]
      );

      // Recalculate summary
      await calculateHQSettlementSummary(client, id);

      // Log action
      await logHQSettlementAction(
        client,
        id,
        userId,
        'ADD_EXPENSE',
        null,
        null,
        { expense_code: expenseCode.rows[0].code, amount, currency },
        `Added HQ expense: ${expenseCode.rows[0].code}`,
        req.ip
      );

      await client.query('COMMIT');

      // Get full expense details
      const expense = await db.query(
        `SELECT he.*, ec.code as expense_code, ec.name as expense_name
         FROM hq_settlement_expenses he
         JOIN expense_codes ec ON he.expense_code_id = ec.id
         WHERE he.id = $1`,
        [result.rows[0].id]
      );

      res.status(201).json({
        success: true,
        message: 'HQ Expense added successfully',
        data: { expense: expense.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Add HQ expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to add HQ expense'
    });
  }
};

// REMOVE HQ expense
const removeHQExpense = async (req, res) => {
  try {
    const { id, expenseId } = req.params;
    const userId = req.user.id;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify HQ settlement is in DRAFT status
      const hqSettlement = await client.query(
        'SELECT status FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'HQ Settlement not found'
        });
      }

      if (hqSettlement.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only remove expenses from DRAFT HQ settlements'
        });
      }

      // Get expense details for audit log
      const expense = await client.query(
        `SELECT he.*, ec.code as expense_code
         FROM hq_settlement_expenses he
         JOIN expense_codes ec ON he.expense_code_id = ec.id
         WHERE he.id = $1 AND he.hq_settlement_id = $2`,
        [expenseId, id]
      );

      if (expense.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Expense not found'
        });
      }

      // Delete expense
      await client.query('DELETE FROM hq_settlement_expenses WHERE id = $1', [expenseId]);

      // Recalculate summary
      await calculateHQSettlementSummary(client, id);

      // Log action
      await logHQSettlementAction(
        client,
        id,
        userId,
        'REMOVE_EXPENSE',
        null,
        { expense_code: expense.rows[0].expense_code, amount: expense.rows[0].amount },
        null,
        `Removed HQ expense: ${expense.rows[0].expense_code}`,
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'HQ Expense removed successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Remove HQ expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to remove HQ expense'
    });
  }
};

// GET available station settlements for HQ settlement
const getAvailableStationSettlements = async (req, res) => {
  try {
    const { id } = req.params;
    const { period_from, period_to } = req.query;

    // Get HQ settlement period if ID provided
    let fromDate = period_from;
    let toDate = period_to;

    if (id) {
      const hqSettlement = await db.query(
        'SELECT period_from, period_to FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (hqSettlement.rows.length > 0) {
        fromDate = fromDate || hqSettlement.rows[0].period_from;
        toDate = toDate || hqSettlement.rows[0].period_to;
      }
    }

    // Get approved/closed station settlements within the period
    let query = `
      SELECT s.*, st.station_code, st.station_name,
             (SELECT COUNT(*) FROM hq_settlement_stations WHERE station_settlement_id = s.id) > 0 as is_linked
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.status IN ('APPROVED', 'CLOSED')
    `;
    const params = [];
    let paramIndex = 1;

    if (fromDate) {
      query += ` AND s.period_from >= $${paramIndex++}`;
      params.push(fromDate);
    }

    if (toDate) {
      query += ` AND s.period_to <= $${paramIndex++}`;
      params.push(toDate);
    }

    // Exclude settlements already in this HQ settlement
    if (id) {
      query += ` AND s.id NOT IN (SELECT station_settlement_id FROM hq_settlement_stations WHERE hq_settlement_id = $${paramIndex++})`;
      params.push(id);
    }

    query += ' ORDER BY st.station_name, s.period_from';

    const result = await db.query(query, params);

    // Get summaries for each
    for (let i = 0; i < result.rows.length; i++) {
      const summaries = await db.query(
        'SELECT * FROM settlement_summaries WHERE settlement_id = $1',
        [result.rows[i].id]
      );
      result.rows[i].summaries = summaries.rows;
    }

    res.json({
      success: true,
      count: result.rows.length,
      data: { station_settlements: result.rows }
    });
  } catch (error) {
    logger.error('Get available station settlements error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available station settlements'
    });
  }
};

// SUBMIT HQ settlement for review
const submitHQSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify exists and is DRAFT
      const hqSettlement = await client.query(
        'SELECT * FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'HQ Settlement not found' });
      }

      if (hqSettlement.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Can only submit DRAFT HQ settlements' });
      }

      // Check at least one station is included
      const stationCount = await client.query(
        'SELECT COUNT(*) FROM hq_settlement_stations WHERE hq_settlement_id = $1',
        [id]
      );

      if (parseInt(stationCount.rows[0].count) === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'At least one station settlement must be included' });
      }

      // Recalculate summary
      await calculateHQSettlementSummary(client, id);

      // Update status
      await client.query(
        `UPDATE hq_settlements
         SET status = 'REVIEW', submitted_by = $1, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [userId, id]
      );

      await logHQSettlementAction(client, id, userId, 'SUBMIT', 'status', { status: 'DRAFT' }, { status: 'REVIEW' }, 'Submitted for review', req.ip);

      await client.query('COMMIT');

      res.json({ success: true, message: 'HQ Settlement submitted for review' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Submit HQ settlement error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to submit HQ settlement' });
  }
};

// APPROVE HQ settlement
const approveHQSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { approval_notes } = req.body;
    const userId = req.user.id;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const hqSettlement = await client.query('SELECT * FROM hq_settlements WHERE id = $1', [id]);

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'HQ Settlement not found' });
      }

      if (hqSettlement.rows[0].status !== 'REVIEW') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Can only approve REVIEW status HQ settlements' });
      }

      if (hqSettlement.rows[0].created_by === userId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Cannot approve your own HQ settlement' });
      }

      await client.query(
        `UPDATE hq_settlements
         SET status = 'APPROVED', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, approval_notes = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [userId, approval_notes || null, id]
      );

      await logHQSettlementAction(client, id, userId, 'APPROVE', 'status', { status: 'REVIEW' }, { status: 'APPROVED' }, approval_notes, req.ip);

      await client.query('COMMIT');

      res.json({ success: true, message: 'HQ Settlement approved' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Approve HQ settlement error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to approve HQ settlement' });
  }
};

// REJECT HQ settlement
const rejectHQSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const userId = req.user.id;

    if (!rejection_reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const hqSettlement = await client.query('SELECT * FROM hq_settlements WHERE id = $1', [id]);

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'HQ Settlement not found' });
      }

      if (hqSettlement.rows[0].status !== 'REVIEW') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Can only reject REVIEW status HQ settlements' });
      }

      await client.query(
        `UPDATE hq_settlements
         SET status = 'DRAFT', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = $2,
             submitted_by = NULL, submitted_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [userId, rejection_reason, id]
      );

      await logHQSettlementAction(client, id, userId, 'REJECT', 'status', { status: 'REVIEW' }, { status: 'DRAFT' }, rejection_reason, req.ip);

      await client.query('COMMIT');

      res.json({ success: true, message: 'HQ Settlement rejected' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Reject HQ settlement error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to reject HQ settlement' });
  }
};

// CLOSE HQ settlement
const closeHQSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const hqSettlement = await client.query('SELECT status FROM hq_settlements WHERE id = $1', [id]);

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'HQ Settlement not found' });
      }

      if (hqSettlement.rows[0].status !== 'APPROVED') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Can only close APPROVED HQ settlements' });
      }

      await client.query(
        'UPDATE hq_settlements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['CLOSED', id]
      );

      await logHQSettlementAction(client, id, userId, 'CLOSE', 'status', { status: 'APPROVED' }, { status: 'CLOSED' }, 'HQ Settlement closed', req.ip);

      await client.query('COMMIT');

      res.json({ success: true, message: 'HQ Settlement closed' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Close HQ settlement error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to close HQ settlement' });
  }
};

// DELETE HQ settlement (DRAFT only)
const deleteHQSettlement = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const hqSettlement = await client.query('SELECT status FROM hq_settlements WHERE id = $1', [id]);

      if (hqSettlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'HQ Settlement not found' });
      }

      if (hqSettlement.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Can only delete DRAFT HQ settlements' });
      }

      await client.query('DELETE FROM hq_settlements WHERE id = $1', [id]);

      await client.query('COMMIT');

      res.json({ success: true, message: 'HQ Settlement deleted' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Delete HQ settlement error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to delete HQ settlement' });
  }
};

module.exports = {
  getHQSettlements,
  getHQSettlementById,
  createHQSettlement,
  addStationSettlement,
  removeStationSettlement,
  addHQExpense,
  removeHQExpense,
  getAvailableStationSettlements,
  submitHQSettlement,
  approveHQSettlement,
  rejectHQSettlement,
  closeHQSettlement,
  deleteHQSettlement
};
