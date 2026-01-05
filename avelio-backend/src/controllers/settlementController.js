const db = require('../config/db');
const logger = require('../utils/logger');

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

  // Get all unsettled sales for this station and date range, grouped by agent and currency
  const salesSummary = await client.query(
    `SELECT agent_id, currency, SUM(amount) as total_amount, COUNT(*) as sale_count
     FROM station_sales
     WHERE station_id = $1
       AND transaction_date >= $2
       AND transaction_date <= $3
       AND (settlement_id IS NULL OR settlement_id = $4)
     GROUP BY agent_id, currency`,
    [station_id, period_from, period_to, settlementId]
  );

  // Clear existing entries for this settlement (preserve declared values)
  const existingEntries = await client.query(
    `SELECT agent_id, currency, declared_cash, notes FROM settlement_agent_entries WHERE settlement_id = $1`,
    [settlementId]
  );

  const existingMap = {};
  existingEntries.rows.forEach(e => {
    existingMap[`${e.agent_id}_${e.currency}`] = e;
  });

  // Delete and recreate entries
  await client.query('DELETE FROM settlement_agent_entries WHERE settlement_id = $1', [settlementId]);

  // Insert new entries with calculated expected cash
  for (const row of salesSummary.rows) {
    const key = `${row.agent_id}_${row.currency}`;
    const existing = existingMap[key];

    await client.query(
      `INSERT INTO settlement_agent_entries
       (settlement_id, agent_id, currency, expected_cash, declared_cash, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        settlementId,
        row.agent_id,
        row.currency,
        parseFloat(row.total_amount),
        existing ? existing.declared_cash : null,
        existing ? existing.notes : null
      ]
    );
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

  // Get unique currencies from agent entries
  const currencies = await client.query(
    `SELECT DISTINCT currency FROM settlement_agent_entries WHERE settlement_id = $1`,
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
      ? parseFloat(previousSettlement.rows[0].final_variance) || 0
      : 0;
    const openingBalanceSettlementId = previousSettlement.rows.length > 0
      ? previousSettlement.rows[0].settlement_id
      : null;

    const expectedCash = parseFloat(expectedResult.rows[0].expected_cash);
    const totalExpenses = parseFloat(expensesResult.rows[0].total_expenses);

    // Expected Net Cash = Expected Cash - Expenses + Opening Balance
    const expectedNetCash = expectedCash - totalExpenses + openingBalance;

    // Calculate actual cash received (sum of declared cash)
    const actualResult = await client.query(
      `SELECT COALESCE(SUM(declared_cash), 0) as actual_cash,
              COUNT(*) FILTER (WHERE declared_cash IS NULL) as pending_count
       FROM settlement_agent_entries
       WHERE settlement_id = $1 AND currency = $2`,
      [settlementId, currency]
    );

    const actualCashReceived = parseFloat(actualResult.rows[0].actual_cash);
    const hasPending = parseInt(actualResult.rows[0].pending_count) > 0;

    // Final Variance = Actual Cash Received - Expected Net Cash
    const finalVariance = actualCashReceived - expectedNetCash;

    // Determine variance status
    let varianceStatus = 'PENDING';
    if (!hasPending) {
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
      `INSERT INTO settlement_summaries
       (settlement_id, currency, opening_balance, opening_balance_settlement_id,
        expected_cash, total_expenses, expected_net_cash, actual_cash_received,
        final_variance, variance_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        varianceStatus
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

    // Get summaries for each settlement
    const settlements = [];
    for (const row of result.rows) {
      const summaries = await db.query(
        `SELECT currency, expected_cash, total_expenses, expected_net_cash,
                actual_cash_received, final_variance, variance_status
         FROM settlement_summaries WHERE settlement_id = $1`,
        [row.id]
      );

      settlements.push({
        ...row,
        summaries: summaries.rows
      });
    }

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
       JOIN sales_agents sa ON sae.agent_id = sa.id
       WHERE sae.settlement_id = $1
       ORDER BY sa.agent_name, sae.currency`,
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
         JOIN sales_agents sa ON sae.agent_id = sa.id
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

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement is in DRAFT status
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

      if (settlementCheck.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only update declared cash for DRAFT settlements'
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

      // Update entry (trigger will calculate variance)
      await client.query(
        `UPDATE settlement_agent_entries
         SET declared_cash = $1, notes = COALESCE($2, notes)
         WHERE id = $3`,
        [declared_cash !== undefined ? parseFloat(declared_cash) : null, notes, agentEntryId]
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
         JOIN sales_agents sa ON sae.agent_id = sa.id
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

      // Verify settlement is in DRAFT status
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

      if (settlementCheck.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only add expenses to DRAFT settlements'
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

      // Add expense
      const result = await client.query(
        `INSERT INTO settlement_expenses
         (settlement_id, expense_code_id, currency, amount, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, expense_code_id, currency, parseFloat(amount), description || null, userId]
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

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify settlement is in DRAFT status
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

      if (settlementCheck.rows[0].status !== 'DRAFT') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Can only remove expenses from DRAFT settlements'
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

// SUBMIT settlement for review (DRAFT -> REVIEW)
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

      // Check if all agent entries have declared cash
      const pendingCheck = await client.query(
        `SELECT COUNT(*) FROM settlement_agent_entries
         WHERE settlement_id = $1 AND declared_cash IS NULL`,
        [id]
      );

      if (parseInt(pendingCheck.rows[0].count) > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'All agent entries must have declared cash before submitting'
        });
      }

      // Recalculate summary before submission
      await calculateSettlementSummary(client, id);

      // Update status
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
        message: 'Settlement submitted for review'
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

// DELETE settlement (only DRAFT settlements can be deleted)
const deleteSettlement = async (req, res) => {
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
          message: 'Can only delete DRAFT settlements'
        });
      }

      // Unlink sales from this settlement
      await client.query(
        `UPDATE station_sales SET settlement_id = NULL WHERE settlement_id = $1`,
        [id]
      );

      // Delete settlement (cascades to entries, expenses, summaries, audit logs)
      await client.query('DELETE FROM settlements WHERE id = $1', [id]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Settlement deleted successfully'
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
      JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE sae.settlement_id = $1
    `;
    const params = [id];

    if (currency) {
      query += ' AND sae.currency = $2';
      params.push(currency);
    }

    query += ' ORDER BY sa.agent_name, sae.currency';

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

module.exports = {
  getSettlements,
  getSettlementById,
  createSettlement,
  updateAgentDeclaredCash,
  addExpense,
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
