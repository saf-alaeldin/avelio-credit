const db = require('../config/db');
const logger = require('../utils/logger');

// Round money to 2 decimal places to avoid floating-point errors
const roundMoney = (value) => {
  return Math.round((parseFloat(value) || 0) * 100) / 100;
};

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
// Opening Balance = Previous Opening + Previous To Safe (cumulative - represents total cash in safe)
// Only count summaries that had actual cash from stations (skip empty days)
async function getOpeningBalance(client, summaryDate, currency) {
  const result = await client.query(
    `SELECT hss.opening_balance, hss.safe_amount
     FROM hq_settlement_summaries hss
     JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
     WHERE hs.status = 'CLOSED'
       AND hs.summary_date < $1
       AND hss.currency = $2
       AND hss.cash_from_stations > 0
     ORDER BY hs.summary_date DESC
     LIMIT 1`,
    [summaryDate, currency]
  );
  if (result.rows.length > 0) {
    // Opening = Previous Opening + Previous To Safe (cumulative total in safe)
    const prevOpening = roundMoney(result.rows[0].opening_balance);
    const prevToSafe = roundMoney(result.rows[0].safe_amount);
    return roundMoney(prevOpening + prevToSafe);
  }
  return 0;
}

// Helper: Get cash from all station settlements REGISTERED on a given date
async function getCashFromStations(client, summaryDate, currency) {
  // Count settlements based on when they were REGISTERED (created_at date), NOT the sales period
  // For stations WITH agents (like Juba): use actual_cash_received (sum of agent declared cash)
  // For stations WITHOUT agents: use station_declared_cash (only if declared)
  const result = await client.query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN ss.station_declared_cash IS NOT NULL THEN ss.station_declared_cash
         WHEN ss.actual_cash_received IS NOT NULL AND ss.actual_cash_received > 0 THEN ss.actual_cash_received
         ELSE 0
       END
     ), 0) as total_cash
     FROM settlement_summaries ss
     JOIN settlements s ON ss.settlement_id = s.id
     WHERE s.status IN ('SUBMITTED', 'REVIEW')
       AND s.created_at::date = $1
       AND ss.currency = $2`,
    [summaryDate, currency]
  );
  return roundMoney(result.rows[0].total_cash);
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
    const totalHQExpenses = roundMoney(hqExpenses.rows[0].total_hq_expenses);

    // Get HQ-level income
    const hqIncome = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_hq_income
       FROM hq_settlement_income
       WHERE hq_settlement_id = $1 AND currency = $2`,
      [summaryId, currency]
    );
    const totalHQIncome = roundMoney(hqIncome.rows[0].total_hq_income);

    // Calculate totals
    // Safe Amount (To Safe) = Cash from Stations + Income - Expenses
    const safeAmount = roundMoney(cashFromStations + totalHQIncome - totalHQExpenses);
    // Total Available = Opening + To Safe (cash available at end of day)
    const totalAvailable = roundMoney(openingBalance + safeAmount);

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
        total_hq_expenses, total_hq_income, safe_amount, total_stations_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (hq_settlement_id, currency)
       DO UPDATE SET
         opening_balance = EXCLUDED.opening_balance,
         cash_from_stations = EXCLUDED.cash_from_stations,
         total_available = EXCLUDED.total_available,
         total_hq_expenses = EXCLUDED.total_hq_expenses,
         total_hq_income = EXCLUDED.total_hq_income,
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
        totalHQIncome,
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

    // Get summaries for all HQ settlements in a single batch query (fixes N+1 problem)
    const hqSettlementIds = result.rows.map(r => r.id);
    let summariesMap = {};

    if (hqSettlementIds.length > 0) {
      const summariesResult = await db.query(
        `SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = ANY($1)`,
        [hqSettlementIds]
      );

      // Group summaries by hq_settlement_id
      summariesResult.rows.forEach(s => {
        if (!summariesMap[s.hq_settlement_id]) summariesMap[s.hq_settlement_id] = [];
        summariesMap[s.hq_settlement_id].push(s);
      });
    }

    // Combine HQ settlements with their summaries
    const summaries = result.rows.map(row => ({
      ...row,
      summaries: summariesMap[row.id] || []
    }));

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

    // Get auto-included station settlements registered on this date
    const stationSettlements = await db.query(
      `SELECT s.*, st.station_code, st.station_name
       FROM settlements s
       JOIN stations st ON s.station_id = st.id
       WHERE s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
         AND s.created_at::date = $1
       ORDER BY st.station_name`,
      [summaryDate]
    );

    // Batch-fetch summaries for all station settlements (avoid N+1 loop)
    if (stationSettlements.rows.length > 0) {
      const settlementIds = stationSettlements.rows.map(s => s.id);
      const allSummaries = await db.query(
        `SELECT * FROM settlement_summaries WHERE settlement_id = ANY($1)`,
        [settlementIds]
      );
      const summariesBySettlement = {};
      allSummaries.rows.forEach(s => {
        if (!summariesBySettlement[s.settlement_id]) summariesBySettlement[s.settlement_id] = [];
        summariesBySettlement[s.settlement_id].push(s);
      });
      stationSettlements.rows.forEach(s => {
        s.summaries = summariesBySettlement[s.id] || [];
      });
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

    // Get HQ income
    const income = await db.query(
      `SELECT hi.*, u.name as created_by_name
       FROM hq_settlement_income hi
       LEFT JOIN users u ON hi.created_by = u.id
       WHERE hi.hq_settlement_id = $1
       ORDER BY hi.created_at DESC`,
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
          income: income.rows,
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
        const openingBalance = roundMoney(currencySummary.rows[0].opening_balance);
        const cashFromStations = roundMoney(currencySummary.rows[0].cash_from_stations);

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

      // AUTO-CLOSE: Close all previous DRAFT summaries before the requested date
      const previousDrafts = await client.query(
        `SELECT id, summary_date FROM hq_settlements
         WHERE status = 'DRAFT' AND summary_date < $1
         ORDER BY summary_date`,
        [date]
      );

      for (const draft of previousDrafts.rows) {
        // Recalculate before closing to ensure accurate totals
        await calculateStationSummary(client, draft.id, draft.summary_date);

        // Close the summary
        await client.query(
          `UPDATE hq_settlements SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [draft.id]
        );

        // Log auto-close action
        await logStationSummaryAction(
          client,
          draft.id,
          userId,
          'AUTO_CLOSE',
          'status',
          { status: 'DRAFT' },
          { status: 'CLOSED' },
          `Auto-closed when opening summary for ${date}`,
          req.ip
        );

        console.log(`Auto-closed summary for ${draft.summary_date}`);
      }

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

      // Only recalculate for DRAFT summaries (CLOSED summaries are locked)
      const currentStatus = stationSummary.rows.length > 0 ? stationSummary.rows[0].status : 'DRAFT';
      if (currentStatus === 'DRAFT' || isNew) {
        console.log('Calculating summary...');
        await calculateStationSummary(client, summaryId, date);
        console.log('Summary calculated!');
      } else {
        console.log('Skipping recalculation for CLOSED summary');
      }

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

      // Get auto-included station settlements registered on this date
      const stationSettlements = await db.query(
        `SELECT s.*, st.station_code, st.station_name
         FROM settlements s
         JOIN stations st ON s.station_id = st.id
         WHERE s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
           AND s.created_at::date = $1
         ORDER BY st.station_name`,
        [date]
      );

      // Batch-fetch summaries for all station settlements (avoid N+1 loop)
      if (stationSettlements.rows.length > 0) {
        const settlementIds = stationSettlements.rows.map(s => s.id);
        const allSummaries = await db.query(
          `SELECT * FROM settlement_summaries WHERE settlement_id = ANY($1)`,
          [settlementIds]
        );
        const summariesBySettlement = {};
        allSummaries.rows.forEach(s => {
          if (!summariesBySettlement[s.settlement_id]) summariesBySettlement[s.settlement_id] = [];
          summariesBySettlement[s.settlement_id].push(s);
        });
        stationSettlements.rows.forEach(s => {
          s.summaries = summariesBySettlement[s.id] || [];
        });
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

      // Get HQ income
      const income = await db.query(
        `SELECT hi.*, u.name as created_by_name
         FROM hq_settlement_income hi
         LEFT JOIN users u ON hi.created_by = u.id
         WHERE hi.hq_settlement_id = $1
         ORDER BY hi.created_at DESC`,
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
            income: income.rows,
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

// ADD HQ income
const addHQIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const { item_name, currency, amount, description } = req.body;
    const userId = req.user.id;

    if (!item_name || !currency || !amount) {
      return res.status(400).json({
        success: false,
        message: 'item_name, currency, and amount are required'
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
          message: 'Can only add income to DRAFT station summaries'
        });
      }

      // Add income
      const result = await client.query(
        `INSERT INTO hq_settlement_income (hq_settlement_id, item_name, currency, amount, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, item_name.trim(), currency, parseFloat(amount), description || null, userId]
      );

      // Recalculate summary
      const summaryDate = stationSummary.rows[0].summary_date || stationSummary.rows[0].period_from;
      await calculateStationSummary(client, id, summaryDate);

      // Log action
      await logStationSummaryAction(
        client,
        id,
        userId,
        'ADD_INCOME',
        null,
        null,
        { item_name, amount, currency },
        `Added income: ${item_name}`,
        req.ip
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Income added successfully',
        data: { income: result.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Add income error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to add income'
    });
  }
};

// REMOVE HQ income
const removeHQIncome = async (req, res) => {
  try {
    const { id, incomeId } = req.params;
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
          message: 'Can only remove income from DRAFT station summaries'
        });
      }

      // Get income details for audit log
      const income = await client.query(
        `SELECT * FROM hq_settlement_income WHERE id = $1 AND hq_settlement_id = $2`,
        [incomeId, id]
      );

      if (income.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Income not found'
        });
      }

      // Delete income
      await client.query('DELETE FROM hq_settlement_income WHERE id = $1', [incomeId]);

      // Recalculate summary
      const summaryDate = stationSummary.rows[0].summary_date || stationSummary.rows[0].period_from;
      await calculateStationSummary(client, id, summaryDate);

      // Log action
      await logStationSummaryAction(
        client,
        id,
        userId,
        'REMOVE_INCOME',
        null,
        { item_name: income.rows[0].item_name, amount: income.rows[0].amount },
        null,
        `Removed income: ${income.rows[0].item_name}`,
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Income removed successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Remove income error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to remove income'
    });
  }
};

module.exports = {
  getHQSettlements,
  getHQSettlementById,
  createHQSettlement,
  addHQExpense,
  removeHQExpense,
  addHQIncome,
  removeHQIncome,
  closeHQSettlement,
  deleteHQSettlement,
  recalculateSummary,
  getExpenseCodes,
  getOrCreateByDate
};
