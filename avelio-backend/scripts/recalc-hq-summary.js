require('dotenv').config();
const { pool } = require('../src/config/db');

async function recalculateHQSummary() {
  const client = await pool.connect();

  try {
    // The settlement STL-JUB-20260114-001 has period_to = 2026-01-14
    const summaryDate = '2026-01-14';

    // Find the HQ settlement for this date
    const hqSettlement = await client.query(`
      SELECT * FROM hq_settlements WHERE summary_date = $1
    `, [summaryDate]);

    console.log('=== HQ Settlement for', summaryDate, '===');

    if (hqSettlement.rows.length === 0) {
      console.log('No HQ Settlement found for this date');

      // Check what dates have HQ settlements
      const allHQ = await pool.query(`
        SELECT id, settlement_number, summary_date, status FROM hq_settlements ORDER BY summary_date DESC
      `);
      console.log('\nAll HQ Settlements:');
      console.log(JSON.stringify(allHQ.rows, null, 2));
      return;
    }

    const hqId = hqSettlement.rows[0].id;
    console.log('Found HQ Settlement:', hqSettlement.rows[0].settlement_number);

    // Show current values
    const currentSummaries = await client.query(`
      SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1
    `, [hqId]);
    console.log('\n=== BEFORE Recalculation ===');
    console.log(JSON.stringify(currentSummaries.rows, null, 2));

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
        WHERE s.status IN ('SUBMITTED', 'REVIEW')
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
        WHERE s.status IN ('SUBMITTED', 'REVIEW')
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
    console.log(JSON.stringify(newSummaries.rows, null, 2));

    console.log('\n✅ HQ Summary recalculated successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

recalculateHQSummary();
