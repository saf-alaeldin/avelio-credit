const db = require('../config/db');
const logger = require('../utils/logger');

// Helper: Round monetary values to 2 decimal places
const roundMoney = (value) => {
  return Math.round((parseFloat(value) || 0) * 100) / 100;
};

// GET operations report with filters
const getOperationsReport = async (req, res) => {
  try {
    const {
      date_from,
      date_to,
      station_id,
      currency = 'USD',
      report_type = 'all' // sales, settlements, financial, or all
    } = req.query;

    // Default to today if no dates provided
    const today = new Date().toISOString().split('T')[0];
    const fromDate = date_from || today;
    const toDate = date_to || today;

    // Build response object
    const response = {
      success: true,
      data: {
        filters: {
          date_from: fromDate,
          date_to: toDate,
          station_id: station_id || null,
          station_name: 'All Stations',
          currency
        },
        sales: null,
        settlements: null,
        financial: null
      }
    };

    // Get station name if filtered
    if (station_id) {
      const stationResult = await db.query(
        'SELECT station_name, station_code FROM stations WHERE id = $1',
        [station_id]
      );
      if (stationResult.rows.length > 0) {
        response.data.filters.station_name = stationResult.rows[0].station_name;
        response.data.filters.station_code = stationResult.rows[0].station_code;
      }
    }

    // ========================================
    // SALES REPORT: Sales grouped by station/agent
    // ========================================
    if (report_type === 'all' || report_type === 'sales') {
      const salesQuery = `
        SELECT
          st.station_code,
          st.station_name,
          sa.agent_name,
          sa.agent_code,
          COALESCE(SUM(ss.sales_amount), 0) as total_sales,
          COALESCE(SUM(ss.cashout_amount), 0) as total_refunds,
          COALESCE(SUM(ss.sales_amount - COALESCE(ss.cashout_amount, 0)), 0) as net_sales,
          COUNT(*) as transaction_count
        FROM station_sales ss
        JOIN stations st ON ss.station_id = st.id
        LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
        WHERE ss.transaction_date >= $1
          AND ss.transaction_date <= $2
          AND ss.currency = $3
          ${station_id ? 'AND ss.station_id = $4' : ''}
        GROUP BY st.station_code, st.station_name, sa.agent_name, sa.agent_code
        ORDER BY st.station_code, sa.agent_name NULLS LAST
      `;

      const salesParams = station_id
        ? [fromDate, toDate, currency, station_id]
        : [fromDate, toDate, currency];

      const salesResult = await db.query(salesQuery, salesParams);

      // Calculate totals
      let totalSales = 0;
      let totalRefunds = 0;
      let totalNet = 0;
      let totalTransactions = 0;

      salesResult.rows.forEach(row => {
        totalSales += parseFloat(row.total_sales) || 0;
        totalRefunds += parseFloat(row.total_refunds) || 0;
        totalNet += parseFloat(row.net_sales) || 0;
        totalTransactions += parseInt(row.transaction_count) || 0;
      });

      response.data.sales = {
        by_station_agent: salesResult.rows.map(row => ({
          station_code: row.station_code,
          station_name: row.station_name,
          agent_name: row.agent_name || 'Station Sales',
          agent_code: row.agent_code || '-',
          total_sales: roundMoney(row.total_sales),
          total_refunds: roundMoney(row.total_refunds),
          net_sales: roundMoney(row.net_sales),
          transaction_count: parseInt(row.transaction_count)
        })),
        totals: {
          sales: roundMoney(totalSales),
          refunds: roundMoney(totalRefunds),
          net: roundMoney(totalNet),
          transactions: totalTransactions
        }
      };
    }

    // ========================================
    // SETTLEMENTS REPORT: Agent variances
    // ========================================
    if (report_type === 'all' || report_type === 'settlements') {
      const settlementsQuery = `
        SELECT
          st.station_code,
          st.station_name,
          sa.agent_name,
          sa.agent_code,
          sae.expected_cash,
          sae.declared_cash,
          sae.variance,
          sae.variance_status,
          s.settlement_number,
          s.period_from,
          s.period_to,
          s.status as settlement_status
        FROM settlement_agent_entries sae
        JOIN settlements s ON sae.settlement_id = s.id
        JOIN stations st ON s.station_id = st.id
        LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
        WHERE s.period_to >= $1
          AND s.period_from <= $2
          AND sae.currency = $3
          AND (sae.is_deleted = false OR sae.is_deleted IS NULL)
          AND (s.is_deleted = false OR s.is_deleted IS NULL)
          ${station_id ? 'AND s.station_id = $4' : ''}
        ORDER BY st.station_code, sa.agent_name NULLS LAST
      `;

      const settlementsParams = station_id
        ? [fromDate, toDate, currency, station_id]
        : [fromDate, toDate, currency];

      const settlementsResult = await db.query(settlementsQuery, settlementsParams);

      // Calculate totals
      let totalExpected = 0;
      let totalDeclared = 0;
      let totalVariance = 0;
      let balancedCount = 0;
      let shortCount = 0;
      let extraCount = 0;

      settlementsResult.rows.forEach(row => {
        totalExpected += parseFloat(row.expected_cash) || 0;
        totalDeclared += parseFloat(row.declared_cash) || 0;
        totalVariance += parseFloat(row.variance) || 0;

        if (row.variance_status === 'BALANCED') balancedCount++;
        else if (row.variance_status === 'SHORT') shortCount++;
        else if (row.variance_status === 'EXTRA') extraCount++;
      });

      response.data.settlements = {
        agent_variances: settlementsResult.rows.map(row => ({
          station_code: row.station_code,
          station_name: row.station_name,
          agent_name: row.agent_name || 'Station Total',
          agent_code: row.agent_code || '-',
          expected_cash: roundMoney(row.expected_cash),
          declared_cash: row.declared_cash !== null ? roundMoney(row.declared_cash) : null,
          variance: roundMoney(row.variance),
          variance_status: row.variance_status || 'PENDING',
          settlement_number: row.settlement_number,
          period_from: row.period_from,
          period_to: row.period_to,
          settlement_status: row.settlement_status
        })),
        totals: {
          expected: roundMoney(totalExpected),
          declared: roundMoney(totalDeclared),
          variance: roundMoney(totalVariance),
          balanced_count: balancedCount,
          short_count: shortCount,
          extra_count: extraCount
        }
      };
    }

    // ========================================
    // FINANCIAL REPORT: Revenue, expenses, cash position
    // ========================================
    if (report_type === 'all' || report_type === 'financial') {
      // Get total sales (revenue)
      const revenueQuery = `
        SELECT
          COALESCE(SUM(ss.sales_amount - COALESCE(ss.cashout_amount, 0)), 0) as total_sales
        FROM station_sales ss
        WHERE ss.transaction_date >= $1
          AND ss.transaction_date <= $2
          AND ss.currency = $3
          ${station_id ? 'AND ss.station_id = $4' : ''}
      `;

      const revenueParams = station_id
        ? [fromDate, toDate, currency, station_id]
        : [fromDate, toDate, currency];

      const revenueResult = await db.query(revenueQuery, revenueParams);
      const totalSalesRevenue = roundMoney(revenueResult.rows[0]?.total_sales || 0);

      // Get station expenses
      const expensesQuery = `
        SELECT
          COALESCE(SUM(se.amount), 0) as total_expenses
        FROM settlement_expenses se
        JOIN settlements s ON se.settlement_id = s.id
        WHERE s.period_to >= $1
          AND s.period_from <= $2
          AND se.currency = $3
          AND (se.is_deleted = false OR se.is_deleted IS NULL)
          AND (s.is_deleted = false OR s.is_deleted IS NULL)
          ${station_id ? 'AND s.station_id = $4' : ''}
      `;

      const expensesParams = station_id
        ? [fromDate, toDate, currency, station_id]
        : [fromDate, toDate, currency];

      const expensesResult = await db.query(expensesQuery, expensesParams);
      const totalExpenses = roundMoney(expensesResult.rows[0]?.total_expenses || 0);

      // Get cash received from settlements (use settlement_summaries for correct net expected with expenses deducted)
      const cashQuery = `
        SELECT
          COALESCE(SUM(ss.expected_net_cash), 0) as expected_cash,
          COALESCE(SUM(ss.actual_cash_received), 0) as received_cash
        FROM settlement_summaries ss
        JOIN settlements s ON ss.settlement_id = s.id
        WHERE s.period_to >= $1
          AND s.period_from <= $2
          AND ss.currency = $3
          AND (s.is_deleted = false OR s.is_deleted IS NULL)
          ${station_id ? 'AND s.station_id = $4' : ''}
      `;

      const cashParams = station_id
        ? [fromDate, toDate, currency, station_id]
        : [fromDate, toDate, currency];

      const cashResult = await db.query(cashQuery, cashParams);
      const expectedCash = roundMoney(cashResult.rows[0]?.expected_cash || 0);
      const receivedCash = roundMoney(cashResult.rows[0]?.received_cash || 0);

      // Calculate financial summary
      const grossRevenue = roundMoney(totalSalesRevenue);
      const netRevenue = roundMoney(grossRevenue - totalExpenses);
      const cashVariance = roundMoney(receivedCash - expectedCash);

      response.data.financial = {
        revenue: {
          sales: totalSalesRevenue,
          gross: grossRevenue
        },
        expenses: {
          station: totalExpenses,
          total: totalExpenses
        },
        net_revenue: netRevenue,
        cash: {
          expected: expectedCash,
          received: receivedCash,
          variance: cashVariance,
          variance_status: cashVariance === 0 ? 'BALANCED' : (cashVariance < 0 ? 'SHORT' : 'EXTRA')
        }
      };
    }

    res.json(response);
  } catch (error) {
    logger.error('Get operations report error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to generate operations report'
    });
  }
};

// GET list of stations for filter dropdown
const getStationsForFilter = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, station_code, station_name
       FROM stations
       WHERE is_active = true
       ORDER BY station_name`
    );

    res.json({
      success: true,
      data: { stations: result.rows }
    });
  } catch (error) {
    logger.error('Get stations for filter error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stations'
    });
  }
};

// GET agencies report - receipt deposits summary
const getAgenciesReport = async (req, res) => {
  try {
    const {
      date_from,
      date_to,
    } = req.query;

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Juba' });
    const fromDate = date_from || today;
    const toDate = date_to || today;

    // Monthly report: filter by issue_date so receipts stay in their issue month
    const receiptsQuery = `
      SELECT
        r.id, r.receipt_number, r.amount, r.currency, r.status, r.payment_method,
        r.issue_date, r.issue_time, r.is_deposited, r.is_external, r.station_code,
        r.payment_date, r.amount_paid, r.amount_remaining,
        a.agency_id as agency_code, a.agency_name
      FROM receipts r
      INNER JOIN agencies a ON r.agency_id = a.id
      WHERE r.is_void = false
        AND r.issue_date >= $1
        AND r.issue_date <= $2
      ORDER BY r.issue_date, r.receipt_number
    `;

    const receiptsResult = await db.query(receiptsQuery, [fromDate, toDate]);
    const receipts = receiptsResult.rows;

    // Collections: fully paid receipts + partial payments within the date range, excluding EBB/external
    const collectionsQuery = `
      SELECT
        r.id, r.receipt_number, r.amount AS receipt_amount, r.currency, r.status, r.payment_method,
        r.issue_date, r.payment_date, r.is_external, r.station_code,
        a.agency_id as agency_code, a.agency_name,
        r.amount AS collected_amount, 'full' AS collection_type
      FROM receipts r
      INNER JOIN agencies a ON r.agency_id = a.id
      WHERE r.is_void = false
        AND r.status = 'PAID'
        AND (r.is_external = false OR r.is_external IS NULL)
        AND r.payment_date::date >= $1::date
        AND r.payment_date::date <= $2::date
        AND r.id NOT IN (SELECT receipt_id FROM payments)
      UNION ALL
      SELECT
        r.id, r.receipt_number, r.amount AS receipt_amount, r.currency, r.status, r.payment_method,
        r.issue_date, p.payment_date, r.is_external, r.station_code,
        a.agency_id as agency_code, a.agency_name,
        p.amount AS collected_amount, 'partial' AS collection_type
      FROM payments p
      INNER JOIN receipts r ON p.receipt_id = r.id
      INNER JOIN agencies a ON r.agency_id = a.id
      WHERE r.is_void = false
        AND (r.is_external = false OR r.is_external IS NULL)
        AND p.payment_date >= $1::date
        AND p.payment_date <= $2::date
      ORDER BY receipt_number
    `;
    const collectionsResult = await db.query(collectionsQuery, [fromDate, toDate]);
    const todaysCollections = collectionsResult.rows;

    let collectionsTotal = 0;
    const collectionDetails = todaysCollections.map(r => {
      const amount = roundMoney(parseFloat(r.collected_amount));
      collectionsTotal += amount;
      const paymentDateStr = r.payment_date ? String(r.payment_date).split(' ')[0].split('T')[0] : null;
      return {
        receipt_number: r.receipt_number,
        agency_code: r.agency_code,
        agency_name: r.agency_name,
        amount,
        currency: r.currency,
        issue_date: r.issue_date,
        payment_date: paymentDateStr,
        is_external: r.is_external || false,
        station_code: r.station_code,
        collection_type: r.collection_type,
      };
    });

    // Calculate summary totals for the period (by issue_date)
    let totalDeposited = 0;
    let totalDepositedCount = 0;
    let totalPending = 0;
    let totalPendingCount = 0;
    let totalBankTransfer = 0;
    let totalBankTransferCount = 0;
    let totalEBB = 0;
    let totalEBBCount = 0;
    let totalPaid = 0;
    let totalPaidCount = 0;

    const details = receipts.map(r => {
      const amount = roundMoney(parseFloat(r.amount));
      const amountPaid = roundMoney(parseFloat(r.amount_paid || 0));
      const amountRemaining = roundMoney(parseFloat(r.amount_remaining || (amount - amountPaid)));
      const status = (r.status || '').toUpperCase();
      const paymentMethod = (r.payment_method || '').toUpperCase();
      const isExternal = r.is_external || false;
      const isBankTransfer = paymentMethod.includes('BANK');
      const paymentDateStr = r.payment_date ? String(r.payment_date).split(' ')[0].split('T')[0] : null;

      // Total deposited = ALL receipts in period
      totalDeposited += amount;
      totalDepositedCount++;

      // Categorize — for partially paid PENDING receipts, split between paid and pending
      let category = 'cash';
      if (status === 'PENDING' || status === 'OVERDUE') {
        if (amountPaid > 0 && amountRemaining > 0) {
          // Partially paid: split the amount
          totalPaid += amountPaid;
          totalPaidCount++;
          totalPending += amountRemaining;
          totalPendingCount++;
          category = 'partial';
        } else {
          totalPending += amount;
          totalPendingCount++;
          category = 'pending';
        }
      } else if (isExternal) {
        totalEBB += amount;
        totalEBBCount++;
        category = 'ebb';
      } else if (isBankTransfer) {
        totalBankTransfer += amount;
        totalBankTransferCount++;
        category = 'bank_transfer';
      } else {
        totalPaid += amount;
        totalPaidCount++;
        category = 'paid';
      }

      return {
        receipt_number: r.receipt_number,
        agency_code: r.agency_code,
        agency_name: r.agency_name,
        amount,
        amount_paid: amountPaid,
        amount_remaining: amountRemaining,
        currency: r.currency,
        status,
        payment_method: r.payment_method,
        issue_date: r.issue_date,
        issue_time: r.issue_time,
        is_deposited: r.is_deposited || false,
        is_external: isExternal,
        station_code: r.station_code,
        category,
        payment_date: paymentDateStr,
      };
    });

    // Safe = Total - Pending - Bank Transfer - EBB
    const safeAmount = roundMoney(totalDeposited - totalPending - totalBankTransfer - totalEBB);

    res.json({
      success: true,
      data: {
        filters: {
          date_from: fromDate,
          date_to: toDate,
        },
        summary: {
          total_deposited: { amount: roundMoney(totalDeposited), count: totalDepositedCount },
          total_pending: { amount: roundMoney(totalPending), count: totalPendingCount },
          total_bank_transfer: { amount: roundMoney(totalBankTransfer), count: totalBankTransferCount },
          total_ebb: { amount: roundMoney(totalEBB), count: totalEBBCount },
          total_paid_cash: { amount: roundMoney(totalPaid), count: totalPaidCount },
          safe_amount: roundMoney(safeAmount),
        },
        collections: {
          date_from: fromDate,
          date_to: toDate,
          total: roundMoney(collectionsTotal),
          count: todaysCollections.length,
          details: collectionDetails,
        },
        details,
      },
    });
  } catch (error) {
    logger.error('Get agencies report error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Failed to generate agencies report',
    });
  }
};

module.exports = {
  getOperationsReport,
  getStationsForFilter,
  getAgenciesReport
};
