const db = require('../config/db');
const logger = require('../utils/logger');

// Helper: Round monetary values to 2 decimal places to avoid float precision issues
const roundMoney = (value) => {
  return Math.round((parseFloat(value) || 0) * 100) / 100;
};

// Helper: Log settlement action
async function logSettlementAction(client, settlementId, userId, action, fieldChanged, oldValue, newValue, notes, ipAddress) {
  try {
    await client.query(
      `INSERT INTO settlement_audit_logs
       (settlement_id, user_id, action, field_changed, old_value, new_value, notes, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        settlementId,
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
    logger.error('Settlement audit log error:', { error: error.message });
  }
}

// Helper: Calculate expected cash for a settlement
async function calculateSettlementExpectedCash(client, settlementId) {
  // Get settlement details
  const settlement = await client.query(
    `SELECT id, station_id, period_from, period_to FROM settlements WHERE id = $1`,
    [settlementId]
  );

  if (settlement.rows.length === 0) return;

  const { station_id, period_from, period_to } = settlement.rows[0];

  // Get all unsettled sales for this station and date range, grouped by agent, currency, and POS
  // Calculate net amount as (sales_amount - cashout_amount)
  // Use the sale's point_of_sale (ss.point_of_sale) NOT the agent's assigned POS
  const salesSummary = await client.query(
    `SELECT ss.agent_id, ss.currency, ss.point_of_sale,
            SUM(COALESCE(ss.sales_amount, ss.amount, 0) - COALESCE(ss.cashout_amount, 0)) as total_amount,
            COUNT(*) as sale_count
     FROM station_sales ss
     WHERE ss.station_id = $1
       AND ss.transaction_date >= $2
       AND ss.transaction_date <= $3
       AND (ss.settlement_id IS NULL OR ss.settlement_id = $4)
     GROUP BY ss.agent_id, ss.currency, ss.point_of_sale`,
    [station_id, period_from, period_to, settlementId]
  );

  // Get existing entries for this settlement (to preserve declared_cash values)
  const existingEntries = await client.query(
    `SELECT id, agent_id, currency, point_of_sale, declared_cash, notes FROM settlement_agent_entries WHERE settlement_id = $1`,
    [settlementId]
  );

  const existingMap = {};
  existingEntries.rows.forEach(e => {
    existingMap[`${e.agent_id}_${e.currency}`] = e;
  });

  // Track which agents have sales
  const agentsWithSales = new Set();

  // Update or insert entries for agents with sales
  for (const row of salesSummary.rows) {
    const key = `${row.agent_id}_${row.currency}`;
    agentsWithSales.add(key);
    const existing = existingMap[key];

    if (existing) {
      // Update existing entry with new expected_cash (rounded for precision)
      await client.query(
        `UPDATE settlement_agent_entries
         SET expected_cash = $1, point_of_sale = COALESCE($2, point_of_sale)
         WHERE id = $3`,
        [
          roundMoney(row.total_amount),
          row.point_of_sale || null,
          existing.id
        ]
      );
    } else {
      // Insert new entry for agent with sales (rounded for precision)
      await client.query(
        `INSERT INTO settlement_agent_entries
         (settlement_id, agent_id, currency, expected_cash, declared_cash, notes, point_of_sale)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          settlementId,
          row.agent_id,
          row.currency,
          roundMoney(row.total_amount),
          null,
          null,
          row.point_of_sale || null
        ]
      );
    }
  }

  // For existing entries without sales: set expected_cash to 0, but ALWAYS keep the entry
  // NEVER auto-delete agent entries - they contain declared_cash which should be preserved
  // If an entry needs to be deleted, it should be done explicitly by the user
  for (const entry of existingEntries.rows) {
    const key = `${entry.agent_id}_${entry.currency}`;
    if (!agentsWithSales.has(key)) {
      // Agent has no sales - set expected_cash to 0 but keep the entry
      await client.query(
        `UPDATE settlement_agent_entries SET expected_cash = 0 WHERE id = $1`,
        [entry.id]
      );
    }
  }

  // Link sales to this settlement
  await client.query(
    `UPDATE station_sales
     SET settlement_id = $1
     WHERE station_id = $2
       AND transaction_date >= $3
       AND transaction_date <= $4
       AND settlement_id IS NULL`,
    [settlementId, station_id, period_from, period_to]
  );
}

// Helper: Calculate settlement summary for each currency
async function calculateSettlementSummary(client, settlementId) {
  // Get settlement and station info
  const settlement = await client.query(
    `SELECT s.*, st.station_code
     FROM settlements s
     JOIN stations st ON s.station_id = st.id
     WHERE s.id = $1`,
    [settlementId]
  );

  if (settlement.rows.length === 0) return;

  const { station_id, period_from } = settlement.rows[0];

  // Get unique currencies from agent entries AND expenses
  const currencies = await client.query(
    `SELECT DISTINCT currency FROM (
       SELECT currency FROM settlement_agent_entries WHERE settlement_id = $1
       UNION
       SELECT currency FROM settlement_expenses WHERE settlement_id = $1
     ) all_currencies`,
    [settlementId]
  );

  for (const { currency } of currencies.rows) {
    // Calculate expected cash (sum of agent entries)
    const expectedResult = await client.query(
      `SELECT COALESCE(SUM(expected_cash), 0) as expected_cash
       FROM settlement_agent_entries
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );

    // Calculate total expenses
    const expensesResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM settlement_expenses
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );

    // Get opening balance (carry-forward from previous approved settlement)
    const previousSettlement = await client.query(
      `SELECT ss.final_variance, s.id as settlement_id
       FROM settlement_summaries ss
       JOIN settlements s ON ss.settlement_id = s.id
       WHERE s.station_id = $1
         AND s.status IN ('APPROVED', 'CLOSED')
         AND s.period_to < $2
         AND ss.currency = $3
       ORDER BY s.period_to DESC
       LIMIT 1`,
      [station_id, period_from, currency]
    );

    const openingBalance = previousSettlement.rows.length > 0
      ? roundMoney(previousSettlement.rows[0].final_variance)
      : 0;
    const openingBalanceSettlementId = previousSettlement.rows.length > 0
      ? previousSettlement.rows[0].settlement_id
      : null;

    const expectedCash = roundMoney(expectedResult.rows[0].expected_cash);
    const totalExpenses = roundMoney(expensesResult.rows[0].total_expenses);

    // Expected Net Cash = Expected Cash - Expenses + Opening Balance (rounded to avoid float precision issues)
    const expectedNetCash = roundMoney(expectedCash - totalExpenses + openingBalance);

    // Calculate actual cash received (sum of declared cash)
    const actualResult = await client.query(
      `SELECT COALESCE(SUM(declared_cash), 0) as actual_cash,
              COUNT(*) FILTER (WHERE declared_cash IS NULL) as pending_count
       FROM settlement_agent_entries
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );

    const actualCashReceived = roundMoney(actualResult.rows[0].actual_cash);
    const hasPending = parseInt(actualResult.rows[0].pending_count) > 0;

    // Final Variance = Actual Cash Received - Expected Net Cash (rounded to avoid float precision issues)
    const finalVariance = roundMoney(actualCashReceived - expectedNetCash);

    // Determine variance status (use tolerance for floating point comparison)
    const VARIANCE_TOLERANCE = 0.01; // 1 cent tolerance
    let varianceStatus = 'PENDING';
    if (!hasPending) {
      if (Math.abs(finalVariance) < VARIANCE_TOLERANCE) {
        varianceStatus = 'BALANCED';
      } else if (finalVariance < 0) {
        varianceStatus = 'SHORT';
      } else {
        varianceStatus = 'EXTRA';
      }
    }

    // Get existing station_declared_cash (preserve it if already set)
    const existingSummary = await client.query(
      `SELECT station_declared_cash FROM settlement_summaries
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );
    const existingStationCash = existingSummary.rows.length > 0
      ? existingSummary.rows[0].station_declared_cash
      : null;

    // Upsert summary (agent_cash_total = actualCashReceived, which is sum of declared_cash)
    await client.query(
      `INSERT INTO settlement_summaries
       (settlement_id, currency, opening_balance, opening_balance_settlement_id,
        expected_cash, total_expenses, expected_net_cash, actual_cash_received,
        final_variance, variance_status, agent_cash_total, station_declared_cash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (settlement_id, currency)
       DO UPDATE SET
         opening_balance = EXCLUDED.opening_balance,
         opening_balance_settlement_id = EXCLUDED.opening_balance_settlement_id,
         expected_cash = EXCLUDED.expected_cash,
         total_expenses = EXCLUDED.total_expenses,
         expected_net_cash = EXCLUDED.expected_net_cash,
         actual_cash_received = EXCLUDED.actual_cash_received,
         final_variance = EXCLUDED.final_variance,
         variance_status = EXCLUDED.variance_status,
         agent_cash_total = EXCLUDED.agent_cash_total,
         updated_at = CURRENT_TIMESTAMP`,
      [
        settlementId,
        currency,
        openingBalance,
        openingBalanceSettlementId,
        expectedCash,
        totalExpenses,
        expectedNetCash,
        actualCashReceived,
        finalVariance,
        varianceStatus,
        actualCashReceived, // agent_cash_total = sum of declared_cash
        existingStationCash // preserve existing station_declared_cash
      ]
    );
  }
}

// GET all settlements
const getSettlements = async (req, res) => {
  try {
    const { station_id, status, date_from, date_to, page = 1, pageSize = 20 } = req.query;

    let query = `
      SELECT s.*, st.station_code, st.station_name,
             u1.name as created_by_name,
             u2.name as reviewed_by_name
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      LEFT JOIN users u1 ON s.created_by = u1.id
      LEFT JOIN users u2 ON s.reviewed_by = u2.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (station_id) {
      query += ` AND s.station_id = $${paramIndex++}`;
      params.push(station_id);
    }

    if (status) {
      query += ` AND s.status = $${paramIndex++}`;
      params.push(status);
    }

    if (date_from) {
      query += ` AND s.period_from >= $${paramIndex++}`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND s.period_to <= $${paramIndex++}`;
      params.push(date_to);
    }

    // Count total
    const countQuery = query.replace(
      /SELECT s\.\*[\s\S]*?FROM settlements s/,
      'SELECT COUNT(*) FROM settlements s'
    );
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    query += ` ORDER BY s.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(pageSize), offset);

    const result = await db.query(query, params);

    // Get summaries for all settlements in a single batch query (fixes N+1 problem)
    const settlementIds = result.rows.map(r => r.id);
    let summariesMap = {};

    if (settlementIds.length > 0) {
      const summariesResult = await db.query(
        `SELECT settlement_id, currency, expected_cash, total_expenses, expected_net_cash,
                actual_cash_received, final_variance, variance_status
         FROM settlement_summaries WHERE settlement_id = ANY($1)`,
        [settlementIds]
      );

      // Group summaries by settlement_id
      summariesResult.rows.forEach(s => {
        if (!summariesMap[s.settlement_id]) summariesMap[s.settlement_id] = [];
        summariesMap[s.settlement_id].push(s);
      });
    }

    // Combine settlements with their summaries
    const settlements = result.rows.map(row => ({
      ...row,
      summaries: summariesMap[row.id] || []
    }));

    res.json({
      success: true,
      count: settlements.length,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      data: { settlements }
    });
  } catch (error) {
    logger.error('Get settlements error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlements'
    });
  }
};

// GET single settlement with full details
const getSettlementById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get settlement
    const result = await db.query(
      `SELECT s.*, st.station_code, st.station_name,
              u1.name as created_by_name,
              u2.name as submitted_by_name,
              u3.name as reviewed_by_name
       FROM settlements s
       JOIN stations st ON s.station_id = st.id
       LEFT JOIN users u1 ON s.created_by = u1.id
       LEFT JOIN users u2 ON s.submitted_by = u2.id
       LEFT JOIN users u3 ON s.reviewed_by = u3.id
       WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    const settlement = result.rows[0];

    // Get agent entries
    const agentEntries = await db.query(
      `SELECT sae.*, sa.agent_code, sa.agent_name
       FROM settlement_agent_entries sae
       LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
       WHERE sae.settlement_id = $1
       ORDER BY sa.agent_name NULLS LAST, sae.currency`,
      [id]
    );

    // Get expenses
    const expenses = await db.query(
      `SELECT se.*, ec.code as expense_code, ec.name as expense_name, ec.category,
              u.name as created_by_name
       FROM settlement_expenses se
       JOIN expense_codes ec ON se.expense_code_id = ec.id
       LEFT JOIN users u ON se.created_by = u.id
       WHERE se.settlement_id = $1
       ORDER BY se.created_at DESC`,
      [id]
    );

    // Get summaries
    const summaries = await db.query(
      `SELECT * FROM settlement_summaries WHERE settlement_id = $1 ORDER BY currency`,
      [id]
    );

    // Get audit logs
    const auditLogs = await db.query(
      `SELECT sal.*, u.name as user_name
       FROM settlement_audit_logs sal
       LEFT JOIN users u ON sal.user_id = u.id
       WHERE sal.settlement_id = $1
       ORDER BY sal.created_at DESC
       LIMIT 50`,
      [id]
    );

    res.json({
      success: true,
      data: {
        settlement: {
          ...settlement,
          agent_entries: agentEntries.rows,
          expenses: expenses.rows,
          summaries: summaries.rows,
          audit_logs: auditLogs.rows
        }
      }
    });
  } catch (error) {
    logger.error('Get settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlement'
    });
  }
};

// CREATE new settlement
const createSettlement = async (req, res) => {
  try {
    const { station_id, period_from, period_to } = req.body;
    const userId = req.user.id;

    if (!station_id || !period_from || !period_to) {
      return res.status(400).json({
        success: false,
        message: 'station_id, period_from, and period_to are required'
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

      // Verify station exists
      const stationCheck = await client.query(
        'SELECT station_code FROM stations WHERE id = $1',
        [station_id]
      );
      if (stationCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Station not found'
        });
      }

      const stationCode = stationCheck.rows[0].station_code;

      // Generate settlement number
      const settlementNumber = await client.query(
        'SELECT generate_settlement_number($1, $2) as number',
        [stationCode, period_from]
      );

      // Create settlement (overlap check is handled by trigger)
      const result = await client.query(
        `INSERT INTO settlements
         (settlement_number, station_id, period_from, period_to, status, created_by)
         VALUES ($1, $2, $3, $4, 'DRAFT', $5)
         RETURNING *`,
        [
          settlementNumber.rows[0].number,
          station_id,
          period_from,
          period_to,
          userId
        ]
      );

      const settlement = result.rows[0];

      // Calculate expected cash and create agent entries
      await calculateSettlementExpectedCash(client, settlement.id);

      // Calculate summary
      await calculateSettlementSummary(client, settlement.id);

      // Log creation
      await logSettlementAction(
        client,
        settlement.id,
        userId,
        'CREATE',
        null,
        null,
        { settlement_number: settlement.settlement_number, period_from, period_to },
        'Settlement created',
        req.ip
      );

      await client.query('COMMIT');

      // Fetch full settlement details
      const fullResult = await db.query(
        `SELECT s.*, st.station_code, st.station_name
         FROM settlements s
         JOIN stations st ON s.station_id = st.id
         WHERE s.id = $1`,
        [settlement.id]
      );

      const agentEntries = await db.query(
        `SELECT sae.*, sa.agent_code, sa.agent_name
         FROM settlement_agent_entries sae
         LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
         WHERE sae.settlement_id = $1`,
        [settlement.id]
      );

      const summaries = await db.query(
        `SELECT * FROM settlement_summaries WHERE settlement_id = $1`,
        [settlement.id]
      );

      res.status(201).json({
        success: true,
        message: 'Settlement created successfully',
        data: {
          settlement: {
            ...fullResult.rows[0],
            agent_entries: agentEntries.rows,
            summaries: summaries.rows
          }
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');

      // Check for overlap error
      if (error.message.includes('overlaps')) {
        return res.status(400).json({
          success: false,
          message: 'Settlement period overlaps with an existing settlement for this station'
        });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Create settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create settlement'
    });
  }
};

// UPDATE declared cash for an agent entry
const updateAgentDeclaredCash = async (req, res) => {
  try {
    const { id, agentEntryId } = req.params;
    const { declared_cash, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists
      const settlementCheck = await client.query(
        'SELECT status FROM settlements WHERE id = $1',
        [id]
      );

      if (settlementCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      const status = settlementCheck.rows[0].status;

      // DRAFT can be edited by anyone, SUBMITTED only by admin
      if (status !== 'DRAFT' && userRole !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Only administrators can edit submitted settlements'
        });
      }

      // Get current entry
      const current = await client.query(
        `SELECT * FROM settlement_agent_entries WHERE id = $1 AND settlement_id = $2`,
        [agentEntryId, id]
      );

      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Agent entry not found'
        });
      }

      const oldValue = current.rows[0].declared_cash;

      // Update entry (trigger will calculate variance, rounded for precision)
      await client.query(
        `UPDATE settlement_agent_entries
         SET declared_cash = $1, notes = COALESCE($2, notes)
         WHERE id = $3`,
        [declared_cash !== undefined ? roundMoney(declared_cash) : null, notes, agentEntryId]
      );

      // Recalculate summary
      await calculateSettlementSummary(client, id);

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'UPDATE_DECLARED_CASH',
        'declared_cash',
        { declared_cash: oldValue },
        { declared_cash: declared_cash },
        null,
        req.ip
      );

      await client.query('COMMIT');

      // Get updated entry
      const updated = await db.query(
        `SELECT sae.*, sa.agent_code, sa.agent_name
         FROM settlement_agent_entries sae
         LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
         WHERE sae.id = $1`,
        [agentEntryId]
      );

      res.json({
        success: true,
        message: 'Declared cash updated successfully',
        data: { agent_entry: updated.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Update declared cash error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update declared cash'
    });
  }
};

// ADD expense to settlement
const addExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { expense_code_id, currency, amount, description, point_of_sale } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

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

      // Verify settlement exists
      const settlementCheck = await client.query(
        'SELECT status FROM settlements WHERE id = $1',
        [id]
      );

      if (settlementCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      const status = settlementCheck.rows[0].status;

      // DRAFT can be edited by anyone, SUBMITTED only by admin
      if (status !== 'DRAFT' && userRole !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Only administrators can edit submitted settlements'
        });
      }

      // Verify expense code exists and allows this currency
      const codeCheck = await client.query(
        'SELECT * FROM expense_codes WHERE id = $1 AND is_active = true',
        [expense_code_id]
      );

      if (codeCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Expense code not found or inactive'
        });
      }

      if (!codeCheck.rows[0].currencies_allowed.includes(currency)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Currency ${currency} not allowed for this expense code`
        });
      }

      // Add expense (rounded for precision)
      const result = await client.query(
        `INSERT INTO settlement_expenses
         (settlement_id, expense_code_id, currency, amount, description, point_of_sale, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, expense_code_id, currency, roundMoney(amount), description || null, point_of_sale || null, userId]
      );

      // Recalculate summary
      await calculateSettlementSummary(client, id);

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'ADD_EXPENSE',
        null,
        null,
        { expense_code: codeCheck.rows[0].code, amount, currency },
        null,
        req.ip
      );

      await client.query('COMMIT');

      // Get full expense details
      const expense = await db.query(
        `SELECT se.*, ec.code as expense_code, ec.name as expense_name, ec.category
         FROM settlement_expenses se
         JOIN expense_codes ec ON se.expense_code_id = ec.id
         WHERE se.id = $1`,
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

// REMOVE expense from settlement
const removeExpense = async (req, res) => {
  try {
    const { id, expenseId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists
      const settlementCheck = await client.query(
        'SELECT status FROM settlements WHERE id = $1',
        [id]
      );

      if (settlementCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      const status = settlementCheck.rows[0].status;

      // DRAFT can be edited by anyone, SUBMITTED only by admin
      if (status !== 'DRAFT' && userRole !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Only administrators can edit submitted settlements'
        });
      }

      // Get expense details for logging
      const expense = await client.query(
        `SELECT se.*, ec.code as expense_code
         FROM settlement_expenses se
         JOIN expense_codes ec ON se.expense_code_id = ec.id
         WHERE se.id = $1 AND se.settlement_id = $2`,
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
      await client.query('DELETE FROM settlement_expenses WHERE id = $1', [expenseId]);

      // Recalculate summary
      await calculateSettlementSummary(client, id);

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'REMOVE_EXPENSE',
        null,
        { expense_code: expense.rows[0].expense_code, amount: expense.rows[0].amount },
        null,
        null,
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

// UPDATE expense (admin only for submitted settlements)
const updateExpense = async (req, res) => {
  try {
    const { id, expenseId } = req.params;
    const { expense_code_id, amount, description } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Admin only
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can edit expenses'
      });
    }

    if (!expense_code_id && !amount && description === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one field to update is required'
      });
    }

    if (amount !== undefined && parseFloat(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists
      const settlementCheck = await client.query(
        'SELECT status FROM settlements WHERE id = $1',
        [id]
      );

      if (settlementCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      // Get existing expense
      const existingExpense = await client.query(
        `SELECT se.*, ec.code as expense_code
         FROM settlement_expenses se
         JOIN expense_codes ec ON se.expense_code_id = ec.id
         WHERE se.id = $1 AND se.settlement_id = $2`,
        [expenseId, id]
      );

      if (existingExpense.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Expense not found'
        });
      }

      const oldExpense = existingExpense.rows[0];

      // If changing expense code, verify it exists and allows the currency
      let newExpenseCode = null;
      if (expense_code_id && expense_code_id !== oldExpense.expense_code_id) {
        const codeCheck = await client.query(
          'SELECT * FROM expense_codes WHERE id = $1 AND is_active = true',
          [expense_code_id]
        );

        if (codeCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Expense code not found or inactive'
          });
        }

        if (!codeCheck.rows[0].currencies_allowed.includes(oldExpense.currency)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Currency ${oldExpense.currency} not allowed for this expense code`
          });
        }

        newExpenseCode = codeCheck.rows[0];
      }

      // Build update query
      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (expense_code_id) {
        updates.push(`expense_code_id = $${paramIndex++}`);
        params.push(expense_code_id);
      }

      if (amount !== undefined) {
        updates.push(`amount = $${paramIndex++}`);
        params.push(roundMoney(amount));
      }

      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        params.push(description || null);
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      params.push(expenseId);

      await client.query(
        `UPDATE settlement_expenses SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );

      // Recalculate summary
      await calculateSettlementSummary(client, id);

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'UPDATE_EXPENSE',
        null,
        { expense_code: oldExpense.expense_code, amount: oldExpense.amount },
        { expense_code: newExpenseCode?.code || oldExpense.expense_code, amount: amount || oldExpense.amount },
        null,
        req.ip
      );

      await client.query('COMMIT');

      // Get updated expense details
      const updatedExpense = await db.query(
        `SELECT se.*, ec.code as expense_code, ec.name as expense_name, ec.category
         FROM settlement_expenses se
         JOIN expense_codes ec ON se.expense_code_id = ec.id
         WHERE se.id = $1`,
        [expenseId]
      );

      res.json({
        success: true,
        message: 'Expense updated successfully',
        data: { expense: updatedExpense.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Update expense error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update expense'
    });
  }
};

// SUBMIT settlement (DRAFT -> SUBMITTED) - Final submission, only admin can modify after this
const submitSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists and is in DRAFT status
      const settlement = await client.query(
        'SELECT * FROM settlements WHERE id = $1',
        [id]
      );

      if (settlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      if (settlement.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only submit DRAFT settlements'
        });
      }

      // Recalculate summary before submission
      await calculateSettlementSummary(client, id);

      // Update status to REVIEW (for approval workflow)
      await client.query(
        `UPDATE settlements
         SET status = 'REVIEW', submitted_by = $1, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [userId, id]
      );

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'SUBMIT',
        'status',
        { status: 'DRAFT' },
        { status: 'REVIEW' },
        'Settlement submitted for review',
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Settlement submitted successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Submit settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to submit settlement'
    });
  }
};

// APPROVE settlement (REVIEW -> APPROVED)
const approveSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { approval_type, approval_notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Only manager or admin can approve
    if (!['manager', 'admin'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only managers or admins can approve settlements'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists and is in REVIEW status
      const settlement = await client.query(
        'SELECT * FROM settlements WHERE id = $1',
        [id]
      );

      if (settlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      if (settlement.rows[0].status !== 'REVIEW') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only approve settlements in REVIEW status'
        });
      }

      // Prevent self-approval (creator cannot approve)
      if (settlement.rows[0].created_by === userId) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Cannot approve your own settlement'
        });
      }

      // Determine approval type
      const summaries = await client.query(
        `SELECT variance_status FROM settlement_summaries WHERE settlement_id = $1`,
        [id]
      );

      const hasVariance = summaries.rows.some(s => s.variance_status !== 'BALANCED');
      const finalApprovalType = approval_type || (hasVariance ? 'APPROVED_WITH_VARIANCE' : 'BALANCED');

      // Update settlement
      await client.query(
        `UPDATE settlements
         SET status = 'APPROVED',
             reviewed_by = $1,
             reviewed_at = CURRENT_TIMESTAMP,
             approval_type = $2,
             approval_notes = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [userId, finalApprovalType, approval_notes || null, id]
      );

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'APPROVE',
        'status',
        { status: 'REVIEW' },
        { status: 'APPROVED', approval_type: finalApprovalType },
        approval_notes,
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Settlement approved successfully',
        data: { approval_type: finalApprovalType }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Approve settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to approve settlement'
    });
  }
};

// REJECT settlement (REVIEW -> REJECTED)
const rejectSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Only manager or admin can reject
    if (!['manager', 'admin'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only managers or admins can reject settlements'
      });
    }

    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists and is in REVIEW status
      const settlement = await client.query(
        'SELECT * FROM settlements WHERE id = $1',
        [id]
      );

      if (settlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      if (settlement.rows[0].status !== 'REVIEW') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only reject settlements in REVIEW status'
        });
      }

      // Update settlement (back to DRAFT so it can be corrected)
      await client.query(
        `UPDATE settlements
         SET status = 'DRAFT',
             reviewed_by = $1,
             reviewed_at = CURRENT_TIMESTAMP,
             rejection_reason = $2,
             submitted_by = NULL,
             submitted_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [userId, rejection_reason, id]
      );

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'REJECT',
        'status',
        { status: 'REVIEW' },
        { status: 'DRAFT' },
        rejection_reason,
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Settlement rejected and returned to draft'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Reject settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to reject settlement'
    });
  }
};

// CLOSE settlement (APPROVED -> CLOSED)
const closeSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Only admin can close
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can close settlements'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists and is in APPROVED status
      const settlement = await client.query(
        'SELECT * FROM settlements WHERE id = $1',
        [id]
      );

      if (settlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      if (settlement.rows[0].status !== 'APPROVED') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only close APPROVED settlements'
        });
      }

      // Update settlement
      await client.query(
        `UPDATE settlements
         SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id]
      );

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'CLOSE',
        'status',
        { status: 'APPROVED' },
        { status: 'CLOSED' },
        'Settlement closed',
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Settlement closed successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Close settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to close settlement'
    });
  }
};

// DELETE settlement (DRAFT by anyone, SUBMITTED only by admin)
const deleteSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists
      const settlement = await client.query(
        'SELECT * FROM settlements WHERE id = $1',
        [id]
      );

      if (settlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      const settlementData = settlement.rows[0];

      // Only admin can delete submitted settlements
      if (settlementData.status !== 'DRAFT' && userRole !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Only administrators can delete submitted settlements'
        });
      }

      // Delete related records first (in case cascade doesn't work)
      await client.query('DELETE FROM settlement_audit_logs WHERE settlement_id = $1', [id]);
      await client.query('DELETE FROM settlement_agent_entries WHERE settlement_id = $1', [id]);
      await client.query('DELETE FROM settlement_expenses WHERE settlement_id = $1', [id]);
      await client.query('DELETE FROM settlement_summaries WHERE settlement_id = $1', [id]);

      // Unlink sales from this settlement
      await client.query(
        `UPDATE station_sales SET settlement_id = NULL WHERE settlement_id = $1`,
        [id]
      );

      // Delete settlement
      await client.query('DELETE FROM settlements WHERE id = $1', [id]);

      await client.query('COMMIT');

      logger.info('Settlement deleted by admin', {
        settlementId: id,
        settlementNumber: settlementData.settlement_number,
        deletedBy: userId
      });

      res.json({
        success: true,
        message: `Settlement ${settlementData.settlement_number} deleted successfully`
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Delete settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete settlement'
    });
  }
};

// Recalculate settlement (refresh expected cash from sales)
const recalculateSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists and is in DRAFT status
      const settlement = await client.query(
        'SELECT status FROM settlements WHERE id = $1',
        [id]
      );

      if (settlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      if (settlement.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only recalculate DRAFT settlements'
        });
      }

      // Recalculate
      await calculateSettlementExpectedCash(client, id);
      await calculateSettlementSummary(client, id);

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'RECALCULATE',
        null,
        null,
        null,
        'Settlement recalculated',
        req.ip
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Settlement recalculated successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Recalculate settlement error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate settlement'
    });
  }
};

// GET settlement summary
const getSettlementSummary = async (req, res) => {
  try {
    const { id } = req.params;

    const summaries = await db.query(
      `SELECT * FROM settlement_summaries WHERE settlement_id = $1 ORDER BY currency`,
      [id]
    );

    if (summaries.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Settlement summaries not found'
      });
    }

    res.json({
      success: true,
      data: { summaries: summaries.rows }
    });
  } catch (error) {
    logger.error('Get settlement summary error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlement summary'
    });
  }
};

// GET settlement agent entries
const getSettlementAgents = async (req, res) => {
  try {
    const { id } = req.params;
    const { currency } = req.query;

    let query = `
      SELECT sae.*, sa.agent_code, sa.agent_name
      FROM settlement_agent_entries sae
      LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE sae.settlement_id = $1
    `;
    const params = [id];

    if (currency) {
      query += ' AND sae.currency = $2';
      params.push(currency);
    }

    query += ' ORDER BY sa.agent_name NULLS LAST, sae.currency';

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: { agent_entries: result.rows }
    });
  } catch (error) {
    logger.error('Get settlement agents error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlement agents'
    });
  }
};

// GET settlement expenses
const getSettlementExpenses = async (req, res) => {
  try {
    const { id } = req.params;
    const { currency } = req.query;

    let query = `
      SELECT se.*, ec.code as expense_code, ec.name as expense_name, ec.category,
             u.name as created_by_name
      FROM settlement_expenses se
      JOIN expense_codes ec ON se.expense_code_id = ec.id
      LEFT JOIN users u ON se.created_by = u.id
      WHERE se.settlement_id = $1
    `;
    const params = [id];

    if (currency) {
      query += ' AND se.currency = $2';
      params.push(currency);
    }

    query += ' ORDER BY se.created_at DESC';

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: { expenses: result.rows }
    });
  } catch (error) {
    logger.error('Get settlement expenses error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlement expenses'
    });
  }
};

// UPDATE station declared cash (for verification against agent total)
const updateStationDeclaredCash = async (req, res) => {
  try {
    const { id } = req.params;
    const { currency, station_declared_cash } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!currency) {
      return res.status(400).json({
        success: false,
        message: 'Currency is required'
      });
    }

    if (station_declared_cash === undefined || station_declared_cash === null) {
      return res.status(400).json({
        success: false,
        message: 'station_declared_cash is required'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists
      const settlement = await client.query(
        'SELECT status FROM settlements WHERE id = $1',
        [id]
      );

      if (settlement.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      const status = settlement.rows[0].status;

      // DRAFT can be edited by anyone, SUBMITTED only by admin
      if (status !== 'DRAFT' && userRole !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Only administrators can edit submitted settlements'
        });
      }

      // Get current value for audit log
      const currentSummary = await client.query(
        `SELECT station_declared_cash FROM settlement_summaries
         WHERE settlement_id = $1 AND currency = $2`,
        [id, currency]
      );

      let oldValue = null;

      // If no summary exists for this currency, create one
      if (currentSummary.rows.length === 0) {
        // Create a new summary record for this currency
        // For non-Juba stations with no sales in this currency, we still need to track cash sent
        // Set actual_cash_received = station_declared_cash since there are no agent entries
        const cashAmount = roundMoney(station_declared_cash);
        await client.query(
          `INSERT INTO settlement_summaries
           (settlement_id, currency, opening_balance, expected_cash, total_expenses,
            expected_net_cash, actual_cash_received, final_variance, variance_status,
            agent_cash_total, station_declared_cash)
           VALUES ($1, $2, 0, 0, 0, 0, $3, $3, 'EXTRA', $3, $3)`,
          [id, currency, cashAmount]
        );
      } else {
        oldValue = currentSummary.rows[0].station_declared_cash;
      }

      // Update station_declared_cash (the trigger will calculate cash_match_status, rounded for precision)
      await client.query(
        `UPDATE settlement_summaries
         SET station_declared_cash = $1, updated_at = CURRENT_TIMESTAMP
         WHERE settlement_id = $2 AND currency = $3`,
        [roundMoney(station_declared_cash), id, currency]
      );

      // For non-Juba stations (single agent entry with agent_id = NULL),
      // also update the agent entry's declared_cash so actual_cash_received gets calculated
      const agentEntryUpdate = await client.query(
        `UPDATE settlement_agent_entries
         SET declared_cash = $1, updated_at = CURRENT_TIMESTAMP
         WHERE settlement_id = $2 AND currency = $3 AND agent_id IS NULL
         RETURNING id`,
        [roundMoney(station_declared_cash), id, currency]
      );

      // If we updated an agent entry, recalculate the summary to update actual_cash_received
      if (agentEntryUpdate.rows.length > 0) {
        await calculateSettlementSummary(client, id);
      }

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'UPDATE_STATION_CASH',
        `station_declared_cash_${currency}`,
        { station_declared_cash: oldValue },
        { station_declared_cash: roundMoney(station_declared_cash) },
        `Updated station declared cash for ${currency}`,
        req.ip
      );

      await client.query('COMMIT');

      // Get updated summary
      const updatedSummary = await db.query(
        `SELECT * FROM settlement_summaries WHERE settlement_id = $1 AND currency = $2`,
        [id, currency]
      );

      res.json({
        success: true,
        message: 'Station declared cash updated',
        data: { summary: updatedSummary.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Update station declared cash error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update station declared cash'
    });
  }
};

// Create agent entry (for cases where entry is missing)
const createAgentEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { agent_id, currency, declared_cash } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!agent_id || !currency) {
      return res.status(400).json({
        success: false,
        message: 'agent_id and currency are required'
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement exists
      const settlementCheck = await client.query(
        'SELECT s.*, st.station_code FROM settlements s JOIN stations st ON s.station_id = st.id WHERE s.id = $1',
        [id]
      );

      if (settlementCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Settlement not found'
        });
      }

      const settlement = settlementCheck.rows[0];

      // Only admin can create entries for non-DRAFT settlements
      if (settlement.status !== 'DRAFT' && userRole !== 'admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'Only administrators can modify non-DRAFT settlements'
        });
      }

      // Check if entry already exists
      const existingEntry = await client.query(
        'SELECT id FROM settlement_agent_entries WHERE settlement_id = $1 AND agent_id = $2 AND currency = $3',
        [id, agent_id, currency]
      );

      if (existingEntry.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Agent entry already exists',
          data: { entry_id: existingEntry.rows[0].id }
        });
      }

      // Calculate expected cash from sales for this agent/currency
      const salesSum = await client.query(
        `SELECT COALESCE(SUM(COALESCE(sales_amount, amount, 0) - COALESCE(cashout_amount, 0)), 0) as total
         FROM station_sales
         WHERE settlement_id = $1 AND agent_id = $2 AND currency = $3`,
        [id, agent_id, currency]
      );

      const expectedCash = roundMoney(salesSum.rows[0].total);

      // Create the entry (rounded for precision)
      const result = await client.query(
        `INSERT INTO settlement_agent_entries
         (settlement_id, agent_id, currency, expected_cash, declared_cash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, agent_id, currency, expectedCash, declared_cash !== undefined ? roundMoney(declared_cash) : null]
      );

      // Recalculate summary
      await calculateSettlementSummary(client, id);

      // Log action
      await logSettlementAction(
        client,
        id,
        userId,
        'CREATE_AGENT_ENTRY',
        null,
        null,
        { agent_id, currency, expected_cash: expectedCash, declared_cash },
        'Agent entry created manually',
        req.ip
      );

      await client.query('COMMIT');

      // Get agent details
      const agentDetails = await db.query(
        'SELECT agent_code, agent_name FROM sales_agents WHERE id = $1',
        [agent_id]
      );

      res.status(201).json({
        success: true,
        message: 'Agent entry created',
        data: {
          entry: {
            ...result.rows[0],
            agent_code: agentDetails.rows[0]?.agent_code,
            agent_name: agentDetails.rows[0]?.agent_name
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
    logger.error('Create agent entry error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create agent entry'
    });
  }
};

module.exports = {
  getSettlements,
  getSettlementById,
  createSettlement,
  createAgentEntry,
  updateAgentDeclaredCash,
  updateStationDeclaredCash,
  addExpense,
  updateExpense,
  removeExpense,
  submitSettlement,
  approveSettlement,
  rejectSettlement,
  closeSettlement,
  deleteSettlement,
  recalculateSettlement,
  getSettlementSummary,
  getSettlementAgents,
  getSettlementExpenses
};
