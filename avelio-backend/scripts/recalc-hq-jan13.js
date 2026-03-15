require('dotenv').config();
const { pool } = require('../src/config/db');

async function recalculateHQSummary() {
  const client = await pool.connect();

  try {
    const summaryDate = '2026-01-13';

    // Find the HQ settlement for this date
    const hqSettlement = await client.query(`
      SELECT * FROM hq_settlements WHERE summary_date = $1
    `, [summaryDate]);

    if (hqSettlement.rows.length === 0) {
      console.log('No HQ Settlement found for', summaryDate);
      return;
    }

    const hqId = hqSettlement.rows[0].id;
    const hqStatus = hqSettlement.rows[0].status;
    console.log('Found HQ Settlement:', hqSettlement.rows[0].settlement_number, '- Status:', hqStatus);

    // Show current station settlements for this date
    const stationSettlements = await client.query(`
      SELECT s.settlement_number, st.station_code, s.status, s.submitted_at,
             (SELECT json_agg(json_build_object('currency', ss.currency, 'actual_cash', ss.actual_cash_received, 'station_declared', ss.station_declared_cash))
              FROM settlement_summaries ss WHERE ss.settlement_id = s.id) as summaries
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
        AND s.period_to = $1
    `, [summaryDate]);

    console.log('\n=== Station Settlements for', summaryDate, '===');
    stationSettlements.rows.forEach(s => {
      console.log(`${s.settlement_number} (${s.station_code}) - ${s.status}`);
      if (s.summaries) {
        s.summaries.forEach(sum => {
          const cash = sum.station_declared || sum.actual_cash;
          console.log(`  ${sum.currency}: ${cash}`);
        });
      }
    });

    // Show current HQ summary
    const currentSummaries = await client.query(`
      SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1
    `, [hqId]);
    console.log('\n=== BEFORE Recalculation ===');
    currentSummaries.rows.forEach(s => {
      console.log(`${s.currency}: cash_from_stations=${s.cash_from_stations}, safe_amount=${s.safe_amount}`);
    });

    await client.query('BEGIN');

    // Recalculate for each currency
    const currencies = ['USD', 'SSP'];

    for (const currency of currencies) {
      // Get opening balance from previous CLOSED summary
      const openingResult = await client.query(`
        SELECT hss.safe_amount
        FROM hq_settlement_summaries hss
        JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
        WHERE hs.status = 'CLOSED'
          AND hs.summary_date < $1
          AND hss.currency = $2
        ORDER BY hs.summary_date DESC
        LIMIT 1
      `, [summaryDate, currency]);
      const openingBalance = openingResult.rows.length > 0 ? parseFloat(openingResult.rows[0].safe_amount) : 0;

      // Get cash from all SUBMITTED/REVIEW station settlements for this date
      const cashResult = await client.query(`
        SELECT COALESCE(SUM(COALESCE(ss.station_declared_cash, ss.actual_cash_received)), 0) as total_cash
        FROM settlement_summaries ss
        JOIN settlements s ON ss.settlement_id = s.id
        WHERE s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
          AND s.period_to = $1
          AND ss.currency = $2
      `, [summaryDate, currency]);
      const cashFromStations = parseFloat(cashResult.rows[0].total_cash);

      // Get HQ-level expenses
      const expenseResult = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total_hq_expenses
        FROM hq_settlement_expenses
        WHERE hq_settlement_id = $1 AND currency = $2
      `, [hqId, currency]);
      const totalHQExpenses = parseFloat(expenseResult.rows[0].total_hq_expenses);

      // Calculate totals
      const totalAvailable = openingBalance + cashFromStations;
      const safeAmount = totalAvailable - totalHQExpenses;

      // Get station settlements count
      const countResult = await client.query(`
        SELECT COUNT(DISTINCT s.id) as count
        FROM settlements s
        JOIN settlement_summaries ss ON s.id = ss.settlement_id
        WHERE s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
          AND s.period_to = $1
          AND ss.currency = $2
      `, [summaryDate, currency]);

      console.log(`\n${currency} Calculation:`);
      console.log('  Opening balance:', openingBalance);
      console.log('  Cash from stations:', cashFromStations);
      console.log('  Total available:', totalAvailable);
      console.log('  HQ expenses:', totalHQExpenses);
      console.log('  Safe amount:', safeAmount);
      console.log('  Stations count:', countResult.rows[0].count);

      // Update the summary
      await client.query(`
        UPDATE hq_settlement_summaries
        SET opening_balance = $1,
            cash_from_stations = $2,
            total_available = $3,
            total_hq_expenses = $4,
            safe_amount = $5,
            total_stations_count = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE hq_settlement_id = $7 AND currency = $8
      `, [openingBalance, cashFromStations, totalAvailable, totalHQExpenses, safeAmount,
          parseInt(countResult.rows[0].count), hqId, currency]);
    }

    await client.query('COMMIT');

    // Show updated values
    const newSummaries = await pool.query(`
      SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1
    `, [hqId]);
    console.log('\n=== AFTER Recalculation ===');
    newSummaries.rows.forEach(s => {
      console.log(`${s.currency}: cash_from_stations=${s.cash_from_stations}, safe_amount=${s.safe_amount}`);
    });

    console.log('\n✅ HQ Summary for', summaryDate, 'recalculated successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

recalculateHQSummary();
