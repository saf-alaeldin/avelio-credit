const db = require('../config/db');
const logger = require('../utils/logger');

// Generate sale reference number
function generateSaleReference() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0');

  return `SL${year}${month}${day}-${random}`;
}

// GET all station sales
const getStationSales = async (req, res) => {
  try {
    const {
      station_id,
      agent_id,
      currency,
      date_from,
      date_to,
      settled,
      settlement_id,
      unsettled_only,
      page = 1,
      pageSize = 50
    } = req.query;

    let query = `
      SELECT ss.*,
             st.station_code, st.station_name,
             sa.agent_code, sa.agent_name,
             u.name as created_by_name
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      LEFT JOIN users u ON ss.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (station_id) {
      query += ` AND ss.station_id = $${paramIndex++}`;
      params.push(station_id);
    }

    if (agent_id) {
      query += ` AND ss.agent_id = $${paramIndex++}`;
      params.push(agent_id);
    }

    if (currency) {
      query += ` AND ss.currency = $${paramIndex++}`;
      params.push(currency);
    }

    if (date_from) {
      query += ` AND ss.transaction_date >= $${paramIndex++}`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND ss.transaction_date <= $${paramIndex++}`;
      params.push(date_to);
    }

    if (settled === 'true') {
      query += ' AND ss.settlement_id IS NOT NULL';
    } else if (settled === 'false' || unsettled_only === 'true') {
      query += ' AND ss.settlement_id IS NULL';
    }

    if (settlement_id) {
      query += ` AND ss.settlement_id = $${paramIndex++}`;
      params.push(settlement_id);
    }

    // Count total
    const countQuery = query.replace(
      /SELECT ss\.\*[\s\S]*?FROM station_sales ss/,
      'SELECT COUNT(*) FROM station_sales ss'
    );
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    query += ` ORDER BY ss.transaction_date DESC, ss.transaction_time DESC
               LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(pageSize), offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / parseInt(pageSize)),
      data: {
        sales: result.rows.map(s => ({
          id: s.id,
          sale_reference: s.sale_reference,
          station_id: s.station_id,
          station_code: s.station_code,
          station_name: s.station_name,
          agent_id: s.agent_id,
          agent_code: s.agent_code,
          agent_name: s.agent_name,
          point_of_sale: s.point_of_sale,
          transaction_date: s.transaction_date,
          transaction_time: s.transaction_time,
          flight_reference: s.flight_reference,
          sales_amount: s.sales_amount !== null ? parseFloat(s.sales_amount) : null,
          cashout_amount: s.cashout_amount !== null ? parseFloat(s.cashout_amount) : 0,
          amount: parseFloat(s.amount),
          currency: s.currency,
          payment_method: s.payment_method,
          customer_name: s.customer_name,
          description: s.description,
          settlement_id: s.settlement_id,
          is_settled: s.settlement_id !== null,
          created_by: s.created_by_name,
          created_at: s.created_at
        }))
      }
    });
  } catch (error) {
    logger.error('Get station sales error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station sales'
    });
  }
};

// GET unsettled sales for a station within date range
const getUnsettledSales = async (req, res) => {
  try {
    const { station_id, date_from, date_to, currency } = req.query;

    if (!station_id || !date_from || !date_to) {
      return res.status(400).json({
        success: false,
        message: 'station_id, date_from, and date_to are required'
      });
    }

    let query = `
      SELECT ss.*,
             st.station_code, st.station_name,
             sa.agent_code, sa.agent_name
      FROM station_sales ss
      JOIN stations st ON ss.station_id = st.id
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.station_id = $1
        AND ss.transaction_date >= $2
        AND ss.transaction_date <= $3
        AND ss.settlement_id IS NULL
    `;
    const params = [station_id, date_from, date_to];

    if (currency) {
      query += ` AND ss.currency = $4`;
      params.push(currency);
    }

    query += ' ORDER BY ss.agent_id, ss.transaction_date, ss.transaction_time';

    const result = await db.query(query, params);

    // Group by agent and currency for summary
    const summary = {};
    result.rows.forEach(sale => {
      const key = `${sale.agent_id}_${sale.currency}`;
      if (!summary[key]) {
        summary[key] = {
          agent_id: sale.agent_id,
          agent_code: sale.agent_code,
          agent_name: sale.agent_name,
          currency: sale.currency,
          total_amount: 0,
          sale_count: 0
        };
      }
      summary[key].total_amount += parseFloat(sale.amount);
      summary[key].sale_count += 1;
    });

    res.json({
      success: true,
      count: result.rows.length,
      data: {
        sales: result.rows,
        summary: Object.values(summary)
      }
    });
  } catch (error) {
    logger.error('Get unsettled sales error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unsettled sales'
    });
  }
};

// GET single sale
const getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT ss.*,
              st.station_code, st.station_name,
              sa.agent_code, sa.agent_name,
              u.name as created_by_name
       FROM station_sales ss
       JOIN stations st ON ss.station_id = st.id
       LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
       LEFT JOIN users u ON ss.created_by = u.id
       WHERE ss.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    res.json({
      success: true,
      data: { sale: result.rows[0] }
    });
  } catch (error) {
    logger.error('Get sale error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sale'
    });
  }
};

// CREATE single sale (manual entry)
const createSale = async (req, res) => {
  try {
    const {
      station_id,
      agent_id,
      point_of_sale,
      transaction_date,
      transaction_time,
      flight_reference,
      sales_amount,
      cashout_amount,
      amount, // Legacy support - if sales_amount not provided, use amount
      currency,
      payment_method,
      customer_name,
      description,
      sale_reference,
      settlement_id // Link sale to settlement when adding to existing settlement
    } = req.body;
    const userId = req.user.id;

    // Determine final sales_amount and cashout_amount
    // Support both new fields (sales_amount, cashout_amount) and legacy (amount)
    const finalSalesAmount = sales_amount !== undefined ? parseFloat(sales_amount) : (amount ? parseFloat(amount) : null);
    const finalCashoutAmount = cashout_amount !== undefined ? parseFloat(cashout_amount) : 0;

    // Validation
    if (!station_id || !transaction_date || !currency) {
      return res.status(400).json({
        success: false,
        message: 'station_id, transaction_date, and currency are required'
      });
    }

    if (finalSalesAmount === null || finalSalesAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'sales_amount is required and must be non-negative'
      });
    }

    if (finalCashoutAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'cashout_amount must be non-negative'
      });
    }

    // Balance (sales - cashout) can be negative if refunds exceed sales
    const balance = finalSalesAmount - finalCashoutAmount;

    // Verify station exists and get station details
    const stationCheck = await db.query('SELECT id, station_code FROM stations WHERE id = $1', [station_id]);
    if (stationCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Station not found'
      });
    }

    const station = stationCheck.rows[0];
    const isJubaStation = station.station_code === 'JUB';

    // For Juba station, agent_id and point_of_sale are required
    if (isJubaStation) {
      if (!agent_id) {
        return res.status(400).json({
          success: false,
          message: 'Agent is required for Juba station'
        });
      }
      if (!point_of_sale) {
        return res.status(400).json({
          success: false,
          message: 'Point of Sale is required for Juba station'
        });
      }
    }

    // Verify agent exists (if agent_id is provided)
    if (agent_id) {
      const agentCheck = await db.query('SELECT id FROM sales_agents WHERE id = $1', [agent_id]);
      if (agentCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Sales agent not found'
        });
      }
    }

    // Generate or validate sale reference
    const finalReference = sale_reference || generateSaleReference();

    // Check for duplicate reference
    const refCheck = await db.query(
      'SELECT id FROM station_sales WHERE sale_reference = $1',
      [finalReference]
    );
    if (refCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale reference already exists'
      });
    }

    const result = await db.query(
      `INSERT INTO station_sales
       (sale_reference, station_id, agent_id, point_of_sale, transaction_date, transaction_time,
        flight_reference, sales_amount, cashout_amount, currency, payment_method, customer_name, description, created_by, settlement_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        finalReference,
        station_id,
        agent_id || null,
        point_of_sale || null,
        transaction_date,
        transaction_time || null,
        flight_reference || null,
        finalSalesAmount,
        finalCashoutAmount,
        currency,
        payment_method || 'CASH',
        customer_name || null,
        description || null,
        userId,
        settlement_id || null
      ]
    );

    // Get full sale details
    const sale = await db.query(
      `SELECT ss.*,
              st.station_code, st.station_name,
              sa.agent_code, sa.agent_name
       FROM station_sales ss
       JOIN stations st ON ss.station_id = st.id
       LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
       WHERE ss.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json({
      success: true,
      message: 'Sale created successfully',
      data: { sale: sale.rows[0] }
    });
  } catch (error) {
    logger.error('Create sale error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to create sale'
    });
  }
};

// BULK import sales from CSV data
const importSales = async (req, res) => {
  try {
    const { sales, station_id } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(sales) || sales.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sales array is required'
      });
    }

    const client = await db.pool.connect();
    const imported = [];
    const errors = [];

    try {
      await client.query('BEGIN');

      // Pre-fetch agents for lookup
      const agentsResult = await client.query(
        'SELECT id, agent_code FROM sales_agents'
      );
      const agentMap = {};
      agentsResult.rows.forEach(a => {
        agentMap[a.agent_code.toUpperCase()] = a.id;
      });

      for (let i = 0; i < sales.length; i++) {
        const sale = sales[i];
        const rowNum = i + 1;

        try {
          // Required fields validation
          if (!sale.agent_code && !sale.agent_id) {
            errors.push({ row: rowNum, sale, error: 'Missing agent_code or agent_id' });
            continue;
          }
          if (!sale.transaction_date) {
            errors.push({ row: rowNum, sale, error: 'Missing transaction_date' });
            continue;
          }

          // Support both new fields (sales_amount, cashout_amount) and legacy (amount)
          const importSalesAmount = sale.sales_amount !== undefined ? parseFloat(sale.sales_amount) : (sale.amount ? parseFloat(sale.amount) : null);
          const importCashoutAmount = sale.cashout_amount !== undefined ? parseFloat(sale.cashout_amount) : 0;

          if (importSalesAmount === null || importSalesAmount < 0) {
            errors.push({ row: rowNum, sale, error: 'Invalid or missing sales_amount/amount' });
            continue;
          }
          if (!sale.currency) {
            errors.push({ row: rowNum, sale, error: 'Missing currency' });
            continue;
          }

          // Resolve agent ID
          let agentId = sale.agent_id;
          if (!agentId && sale.agent_code) {
            agentId = agentMap[sale.agent_code.toUpperCase()];
            if (!agentId) {
              errors.push({ row: rowNum, sale, error: `Agent code not found: ${sale.agent_code}` });
              continue;
            }
          }

          // Generate reference if not provided
          const saleRef = sale.sale_reference || generateSaleReference();

          // Check for duplicate reference
          const refCheck = await client.query(
            'SELECT id FROM station_sales WHERE sale_reference = $1',
            [saleRef]
          );
          if (refCheck.rows.length > 0) {
            errors.push({ row: rowNum, sale, error: `Duplicate sale reference: ${saleRef}` });
            continue;
          }

          const result = await client.query(
            `INSERT INTO station_sales
             (sale_reference, station_id, agent_id, transaction_date, transaction_time,
              flight_reference, sales_amount, cashout_amount, currency, payment_method, customer_name, description, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id, sale_reference`,
            [
              saleRef,
              sale.station_id || station_id,
              agentId,
              sale.transaction_date,
              sale.transaction_time || null,
              sale.flight_reference || null,
              importSalesAmount,
              importCashoutAmount,
              sale.currency,
              sale.payment_method || 'CASH',
              sale.customer_name || null,
              sale.description || null,
              userId
            ]
          );

          imported.push({
            row: rowNum,
            id: result.rows[0].id,
            sale_reference: result.rows[0].sale_reference
          });
        } catch (err) {
          errors.push({ row: rowNum, sale, error: err.message });
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Imported ${imported.length} sales, ${errors.length} errors`,
        data: {
          imported_count: imported.length,
          error_count: errors.length,
          total_submitted: sales.length,
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
    logger.error('Import sales error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to import sales'
    });
  }
};

// UPDATE sale (only if not settled)
const updateSale = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      transaction_date,
      transaction_time,
      flight_reference,
      sales_amount,
      cashout_amount,
      amount, // Legacy support
      currency,
      payment_method,
      customer_name,
      description
    } = req.body;

    // Check if sale exists and is not settled
    const existing = await db.query(
      'SELECT id, settlement_id FROM station_sales WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    if (existing.rows[0].settlement_id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify a settled sale'
      });
    }

    // Determine update values - support both new and legacy fields
    const updateSalesAmount = sales_amount !== undefined ? parseFloat(sales_amount) : (amount !== undefined ? parseFloat(amount) : null);
    const updateCashoutAmount = cashout_amount !== undefined ? parseFloat(cashout_amount) : null;

    const result = await db.query(
      `UPDATE station_sales
       SET transaction_date = COALESCE($1, transaction_date),
           transaction_time = COALESCE($2, transaction_time),
           flight_reference = COALESCE($3, flight_reference),
           sales_amount = COALESCE($4, sales_amount),
           cashout_amount = COALESCE($5, cashout_amount),
           currency = COALESCE($6, currency),
           payment_method = COALESCE($7, payment_method),
           customer_name = COALESCE($8, customer_name),
           description = COALESCE($9, description)
       WHERE id = $10
       RETURNING *`,
      [
        transaction_date,
        transaction_time,
        flight_reference,
        updateSalesAmount,
        updateCashoutAmount,
        currency,
        payment_method,
        customer_name,
        description,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Sale updated successfully',
      data: { sale: result.rows[0] }
    });
  } catch (error) {
    logger.error('Update sale error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to update sale'
    });
  }
};

// DELETE sale (admin can delete any, others only if settlement is DRAFT or no settlement)
const deleteSale = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const isAdmin = userRole === 'admin';

    // Check if sale exists and get settlement status
    const existing = await db.query(
      `SELECT ss.id, ss.settlement_id, s.status as settlement_status
       FROM station_sales ss
       LEFT JOIN settlements s ON ss.settlement_id = s.id
       WHERE ss.id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    const sale = existing.rows[0];

    // Admin can delete any sale; others only if no settlement or DRAFT status
    if (!isAdmin && sale.settlement_id && sale.settlement_status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete sale from a ${sale.settlement_status} settlement`
      });
    }

    await db.query('DELETE FROM station_sales WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Sale deleted successfully'
    });
  } catch (error) {
    logger.error('Delete sale error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to delete sale'
    });
  }
};

// GET sales summary by agent for a date range
const getSalesSummary = async (req, res) => {
  try {
    const { station_id, date_from, date_to } = req.query;

    if (!station_id || !date_from || !date_to) {
      return res.status(400).json({
        success: false,
        message: 'station_id, date_from, and date_to are required'
      });
    }

    const result = await db.query(
      `SELECT
         sa.id as agent_id,
         sa.agent_code,
         sa.agent_name,
         ss.currency,
         SUM(ss.amount) as total_amount,
         COUNT(*) as sale_count
       FROM station_sales ss
       JOIN sales_agents sa ON ss.agent_id = sa.id
       WHERE ss.station_id = $1
         AND ss.transaction_date >= $2
         AND ss.transaction_date <= $3
       GROUP BY sa.id, sa.agent_code, sa.agent_name, ss.currency
       ORDER BY sa.agent_name, ss.currency`,
      [station_id, date_from, date_to]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: {
        summary: result.rows.map(r => ({
          agent_id: r.agent_id,
          agent_code: r.agent_code,
          agent_name: r.agent_name,
          currency: r.currency,
          total_amount: parseFloat(r.total_amount),
          sale_count: parseInt(r.sale_count)
        }))
      }
    });
  } catch (error) {
    logger.error('Get sales summary error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales summary'
    });
  }
};

module.exports = {
  getStationSales,
  getUnsettledSales,
  getSaleById,
  createSale,
  importSales,
  updateSale,
  deleteSale,
  getSalesSummary
};
