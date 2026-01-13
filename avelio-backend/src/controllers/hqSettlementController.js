const db = require('../config/db');
const logger = require('../utils/logger');

// Helper: Log station summary action
async function logStationSummaryAction(client, summaryId, userId, action, fieldChanged, oldValue, newValue, notes, ipAddress) {
  try {
    await client.query(
      `INSERT INTO hq_settlement_audit_logs
       (hq_settlement_id, user_id, action, field_changed, old_value, new_value, notes, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        summaryId,
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
    logger.error('Station Summary audit log error:', { error: error.message });
  }
}

// Helper: Get opening balance from previous CLOSED summary
async function getOpeningBalance(client, summaryDate, currency) {
  const result = await client.query(
    `SELECT hss.safe_amount
     FROM hq_settlement_summaries hss
     JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
     WHERE hs.status = 'CLOSED'
       AND hs.summary_date < $1
       AND hss.currency = $2
     ORDER BY hs.summary_date DESC
     LIMIT 1`,
    [summaryDate, currency]
  );
  return result.rows.length > 0 ? parseFloat(result.rows[0].safe_amount) : 0;
}

// Helper: Get cash from all SUBMITTED station settlements for a date
async function getCashFromStations(client, summaryDate, currency) {
  // Use station_declared_cash which is the cash sent value entered by stations
  // For Juba (with agents), this should match agent totals
  // For non-Juba stations, this is the only source of cash sent
  const result = await client.query(
    `SELECT COALESCE(SUM(COALESCE(ss.station_declared_cash, ss.actual_cash_received)), 0) as total_cash
     FROM settlement_summaries ss
     JOIN settlements s ON ss.settlement_id = s.id
     WHERE s.status IN ('SUBMITTED', 'REVIEW')
       AND s.period_to = $1
       AND ss.currency = $2`,
    [summaryDate, currency]
  );
  return parseFloat(result.rows[0].total_cash);
}

// Helper: Calculate Station Summary (updated for new structure)
async function calculateStationSummary(client, summaryId, summaryDate) {
  const currencies = ['USD', 'SSP'];

  for (const currency of currencies) {
    // Get opening balance from previous CLOSED summary
    const openingBalance = await getOpeningBalance(client, summaryDate, currency);

    // Get cash from all SUBMITTED station settlements for this date
    const cashFromStations = await getCashFromStations(client, summaryDate, currency);

    // Get HQ-level expenses
    const hqExpenses = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_hq_expenses
       FROM hq_settlement_expenses
       WHERE hq_settlement_id = $1 AND currency = $2`,
      [summaryId, currency]
    );
    const totalHQExpenses = parseFloat(hqExpenses.rows[0].total_hq_expenses);

    // Calculate totals
    const totalAvailable = openingBalance + cashFromStations;
    const safeAmount = totalAvailable - totalHQExpenses;

    // Get station settlements count for this currency
    const stationCount = await client.query(
      `SELECT COUNT(DISTINCT s.id) as count
       FROM settlements s
       JOIN settlement_summaries ss ON s.id = ss.settlement_id
       WHERE s.status = 'SUBMITTED'
         AND s.period_to = $1
         AND ss.currency = $2`,
      [summaryDate, currency]
    );

    // Upsert summary
    await client.query(
      `INSERT INTO hq_settlement_summaries
       (hq_settlement_id, currency, opening_balance, cash_from_stations, total_available,
        total_hq_expenses, safe_amount, total_stations_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (hq_settlement_id, currency)
       DO UPDATE SET
         opening_balance = EXCLUDED.opening_balance,
         cash_from_stations = EXCLUDED.cash_from_stations,
         total_available = EXCLUDED.total_available,
         total_hq_expenses = EXCLUDED.total_hq_expenses,
         safe_amount = EXCLUDED.safe_amount,
         total_stations_count = EXCLUDED.total_stations_count,
         updated_at = CURRENT_TIMESTAMP`,
      [
        summaryId,
        currency,
        openingBalance,
        cashFromStations,
        totalAvailable,
        totalHQExpenses,
        safeAmount,
        parseInt(stationCount.rows[0].count)
      ]
    );
  }
}

// GET all Station Summaries
const getHQSettlements = async (req, res) => {
  try {
    const { status, date_from, date_to, page = 1, pageSize = 20 } = req.query;

    let query = `
      SELECT hs.*, u1.name as created_by_name
      FROM hq_settlements hs
      LEFT JOIN users u1 ON hs.created_by = u1.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND hs.status = $${paramIndex++}`;
      params.push(status);
    }

    if (date_from) {
      query += ` AND hs.summary_date >= $${paramIndex++}`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND hs.summary_date <= $${paramIndex++}`;
      params.push(date_to);
    }

    // Count total
    const countQuery = query.replace(/SELECT hs\.\*[\s\S]*?FROM hq_settlements hs/, 'SELECT COUNT(*) FROM hq_settlements hs');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    query += ` ORDER BY hs.summary_date DESC, hs.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(pageSize), offset);

    const result = await db.query(query, params);

    // Get summaries for each station summary
    const summaries = [];
    for (const row of result.rows) {
      const summaryData = await db.query(
        `SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1`,
        [row.id]
      );

      summaries.push({
        ...row,
        summaries: summaryData.rows
      });
    }

    res.json({
      success: true,
      count: summaries.length,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      data: summaries
    });
  } catch (error) {
    logger.error('Get Station Summaries error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station summaries'
    });
  }
};

// GET single Station Summary with full details
const getHQSettlementById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get station summary
    const result = await db.query(
      `SELECT hs.*, u1.name as created_by_name
       FROM hq_settlements hs
       LEFT JOIN users u1 ON hs.created_by = u1.id
       WHERE hs.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Station Summary not found'
      });
    }

    const stationSummary = result.rows[0];
    const summaryDate = stationSummary.summary_date || stationSummary.period_from;

    // Auto-recalculate if DRAFT (to pick up new settlements)
    if (stationSummary.status === 'DRAFT') {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await calculateStationSummary(client, id, summaryDate);
        await client.query('COMMIT');
      } catch (calcError) {
        await client.query('ROLLBACK');
        logger.error('Auto-recalculate error:', { error: calcError.message });
      } finally {
        client.release();
      }
    }

    // Get auto-included SUBMITTED station settlements for this date
    const stationSettlements = await db.query(
      `SELECT s.*, st.station_code, st.station_name
       FROM settlements s
       JOIN stations st ON s.station_id = st.id
       WHERE s.status = 'SUBMITTED'
         AND s.period_to = $1
       ORDER BY st.station_name`,
      [summaryDate]
    );

    // Get summaries for each station settlement
    for (let i = 0; i < stationSettlements.rows.length; i++) {
      const settlementSummaries = await db.query(
        `SELECT * FROM settlement_summaries WHERE settlement_id = $1`,
        [stationSettlements.rows[i].id]
      );
      stationSettlements.rows[i].summaries = settlementSummaries.rows;
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

    // Get summaries
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
        station_summary: {
          ...stationSummary,
          station_settlements: stationSettlements.rows,
          expenses: expenses.rows,
          summaries: summaries.rows,
          audit_logs: auditLogs.rows
        }
      }
    });
  } catch (error) {
    logger.error('Get Station Summary error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station summary'
    });
  }
};

// CREATE new Station Summary
const createHQSettlement = async (req, res) => {
  try {
    const { summary_date } = req.body;
    const userId = req.user.id;

    if (!summary_date) {
      return res.status(400).json({
        success: false,
        message: 'summary_date is required'
      });
    }

    // Check if summary already exists for this date
    const existing = await db.query(
      'SELECT id FROM hq_settlements WHERE summary_date = $1',
      [summary_date]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A station summary already exists for this date'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate settlement number
      const settlementNumber = await client.query(
        'SELECT generate_hq_settlement_number($1) as number',
        [summary_date]
      );

      // Create station summary
      const result = await client.query(
        `INSERT INTO hq_settlements (settlement_number, summary_date, period_from, period_to, status, created_by)
         VALUES ($1, $2, $2, $2, 'DRAFT', $3)
         RETURNING *`,
        [settlementNumber.rows[0].number, summary_date, userId]
      );

      const stationSummary = result.rows[0];

      // Calculate initial summary (auto-include SUBMITTED settlements)
      await calculateStationSummary(client, stationSummary.id, summary_date);

      // Log action
      await logStationSummaryAction(
        client,
        stationSummary.id,
        userId,
        'CREATE',
        null,
        null,
        { settlement_number: stationSummary.settlement_number, summary_date },
        'Station Summary created',
        req.ip
      );

      await client.query('COMMIT');

      // Get full details
      const summaries = await db.query(
        'SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1',
        [stationSummary.id]
      );

      res.status(201).json({
        success: true,
        message: 'Station Summary created successfully',
        data: {
          station_summary: {
            ...stationSummary,
            summaries: summaries.rows
          }
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Create Station Summary error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create station summary'
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

      // Verify station summary exists and is in DRAFT status
      const stationSummary = await client.query(
        'SELECT status, summary_date, period_from FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (stationSummary.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Station Summary not found'
        });
      }

      if (stationSummary.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only add expenses to DRAFT station summaries'
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

      // Check currency is allowed by expense code
      if (!expenseCode.rows[0].currencies_allowed.includes(currency)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Expense code does not allow ${currency} currency`
        });
      }

      // Check that currency has cash from stations or opening balance
      const currencySummary = await client.query(
        `SELECT opening_balance, cash_from_stations
         FROM hq_settlement_summaries
         WHERE hq_settlement_id = $1 AND currency = $2`,
        [id, currency]
      );

      if (currencySummary.rows.length > 0) {
        const openingBalance = parseFloat(currencySummary.rows[0].opening_balance || 0);
        const cashFromStations = parseFloat(currencySummary.rows[0].cash_from_stations || 0);

        if (openingBalance <= 0 && cashFromStations <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Cannot add expense in ${currency} - no cash from stations or opening balance in this currency`
          });
        }
      }

      // Add expense
      const result = await client.query(
        `INSERT INTO hq_settlement_expenses (hq_settlement_id, expense_code_id, currency, amount, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, expense_code_id, currency, parseFloat(amount), description || null, userId]
      );

      // Recalculate summary
      const summaryDate = stationSummary.rows[0].summary_date || stationSummary.rows[0].period_from;
      await calculateStationSummary(client, id, summaryDate);

      // Log action
      await logStationSummaryAction(
        client,
        id,
        userId,
        'ADD_EXPENSE',
        null,
        null,
        { expense_code: expenseCode.rows[0].code, amount, currency },
        `Added expense: ${expenseCode.rows[0].code}`,
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
        message: 'Expense added successfully',
        data: { expense: expense.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Add expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to add expense'
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

      // Verify station summary is in DRAFT status
      const stationSummary = await client.query(
        'SELECT status, summary_date, period_from FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (stationSummary.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Station Summary not found'
        });
      }

      if (stationSummary.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only remove expenses from DRAFT station summaries'
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
      const summaryDate = stationSummary.rows[0].summary_date || stationSummary.rows[0].period_from;
      await calculateStationSummary(client, id, summaryDate);

      // Log action
      await logStationSummaryAction(
        client,
        id,
        userId,
        'REMOVE_EXPENSE',
        null,
        { expense_code: expense.rows[0].expense_code, amount: expense.rows[0].amount },
        null,
        `Removed expense: ${expense.rows[0].expense_code}`,
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Expense removed successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Remove expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to remove expense'
    });
  }
};

// CLOSE Station Summary (DRAFT -> CLOSED)
const closeHQSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const stationSummary = await client.query(
        'SELECT status, summary_date, period_from FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (stationSummary.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Station Summary not found' });
      }

      if (stationSummary.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Can only close DRAFT station summaries' });
      }

      // Recalculate summary one last time before closing
      const summaryDate = stationSummary.rows[0].summary_date || stationSummary.rows[0].period_from;
      await calculateStationSummary(client, id, summaryDate);

      // Update status to CLOSED
      await client.query(
        'UPDATE hq_settlements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['CLOSED', id]
      );

      await logStationSummaryAction(
        client,
        id,
        userId,
        'CLOSE',
        'status',
        { status: 'DRAFT' },
        { status: 'CLOSED' },
        'Station Summary closed - safe amounts locked as next day opening balance',
        req.ip
      );

      await client.query('COMMIT');

      res.json({ success: true, message: 'Station Summary closed successfully. Safe amounts are now locked.' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Close Station Summary error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to close station summary' });
  }
};

// DELETE Station Summary (DRAFT only)
const deleteHQSettlement = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const stationSummary = await client.query('SELECT status FROM hq_settlements WHERE id = $1', [id]);

      if (stationSummary.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Station Summary not found' });
      }

      if (stationSummary.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Can only delete DRAFT station summaries' });
      }

      await client.query('DELETE FROM hq_settlements WHERE id = $1', [id]);

      await client.query('COMMIT');

      res.json({ success: true, message: 'Station Summary deleted' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Delete Station Summary error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to delete station summary' });
  }
};

// Recalculate summary (for when station settlements are updated)
const recalculateSummary = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const stationSummary = await client.query(
        'SELECT status, summary_date, period_from FROM hq_settlements WHERE id = $1',
        [id]
      );

      if (stationSummary.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Station Summary not found' });
      }

      if (stationSummary.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Can only recalculate DRAFT station summaries' });
      }

      const summaryDate = stationSummary.rows[0].summary_date || stationSummary.rows[0].period_from;
      await calculateStationSummary(client, id, summaryDate);

      await client.query('COMMIT');

      // Get updated summaries
      const summaries = await db.query(
        'SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1',
        [id]
      );

      res.json({
        success: true,
        message: 'Summary recalculated',
        data: { summaries: summaries.rows }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Recalculate summary error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to recalculate summary' });
  }
};

// GET expense codes (for dropdown)
const getExpenseCodes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM expense_codes WHERE is_active = true ORDER BY category, name`
    );

    res.json({
      success: true,
      data: { expense_codes: result.rows }
    });
  } catch (error) {
    logger.error('Get expense codes error:', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch expense codes' });
  }
};

// GET or CREATE Station Summary for a date (auto-create if doesn't exist)
const getOrCreateByDate = async (req, res) => {
  console.log('=== getOrCreateByDate called ===');
  console.log('Query params:', req.query);
  console.log('User:', req.user);

  try {
    const { date } = req.query;
    const userId = req.user?.id;

    console.log('Date:', date, 'UserId:', userId);

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'date is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    console.log('Connecting to database...');
    const client = await db.pool.connect();
    console.log('Connected!');

    try {
      await client.query('BEGIN');

      // Check if summary exists for this date
      let stationSummary = await client.query(
        'SELECT * FROM hq_settlements WHERE summary_date = $1',
        [date]
      );

      let summaryId;
      let isNew = false;

      if (stationSummary.rows.length === 0) {
        // Auto-create a new Station Summary
        const settlementNumber = await client.query(
          'SELECT generate_hq_settlement_number($1) as number',
          [date]
        );

        const result = await client.query(
          `INSERT INTO hq_settlements (settlement_number, summary_date, period_from, period_to, status, created_by)
           VALUES ($1, $2, $2, $2, 'DRAFT', $3)
           RETURNING *`,
          [settlementNumber.rows[0].number, date, userId]
        );

        stationSummary = { rows: [result.rows[0]] };
        summaryId = result.rows[0].id;
        isNew = true;

        // Log creation
        await logStationSummaryAction(
          client,
          summaryId,
          userId,
          'CREATE',
          null,
          null,
          { settlement_number: result.rows[0].settlement_number, summary_date: date },
          'Station Summary auto-created',
          req.ip
        );
      } else {
        summaryId = stationSummary.rows[0].id;
      }

      // Calculate/recalculate summary (picks up any new SUBMITTED settlements)
      console.log('Calculating summary...');
      await calculateStationSummary(client, summaryId, date);
      console.log('Summary calculated!');

      console.log('Committing transaction...');
      await client.query('COMMIT');
      console.log('Committed!');

      // Get full details including station settlements and expenses
      const fullSummary = await client.query(
        `SELECT hs.*, u1.name as created_by_name
         FROM hq_settlements hs
         LEFT JOIN users u1 ON hs.created_by = u1.id
         WHERE hs.id = $1`,
        [summaryId]
      );

      // Get auto-included SUBMITTED station settlements for this date
      const stationSettlements = await db.query(
        `SELECT s.*, st.station_code, st.station_name
         FROM settlements s
         JOIN stations st ON s.station_id = st.id
         WHERE s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
           AND s.period_to = $1
         ORDER BY st.station_name`,
        [date]
      );

      // Get summaries for each station settlement
      for (let i = 0; i < stationSettlements.rows.length; i++) {
        const settlementSummaries = await db.query(
          `SELECT * FROM settlement_summaries WHERE settlement_id = $1`,
          [stationSettlements.rows[i].id]
        );
        stationSettlements.rows[i].summaries = settlementSummaries.rows;
      }

      // Get HQ expenses
      const expenses = await db.query(
        `SELECT he.*, ec.code as expense_code, ec.name as expense_name, ec.category, u.name as created_by_name
         FROM hq_settlement_expenses he
         JOIN expense_codes ec ON he.expense_code_id = ec.id
         LEFT JOIN users u ON he.created_by = u.id
         WHERE he.hq_settlement_id = $1
         ORDER BY he.created_at DESC`,
        [summaryId]
      );

      // Get summaries
      const summaries = await db.query(
        `SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1 ORDER BY currency`,
        [summaryId]
      );

      res.json({
        success: true,
        is_new: isNew,
        data: {
          station_summary: {
            ...fullSummary.rows[0],
            station_settlements: stationSettlements.rows,
            expenses: expenses.rows,
            summaries: summaries.rows
          }
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Get or create Station Summary error:', { error: error.message, stack: error.stack });
    console.error('FULL ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get or create station summary'
    });
  }
};

module.exports = {
  getHQSettlements,
  getHQSettlementById,
  createHQSettlement,
  addHQExpense,
  removeHQExpense,
  closeHQSettlement,
  deleteHQSettlement,
  recalculateSummary,
  getExpenseCodes,
  getOrCreateByDate
};
