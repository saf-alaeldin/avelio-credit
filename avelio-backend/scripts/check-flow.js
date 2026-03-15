require('dotenv').config();
const { pool } = require('../src/config/db');

async function check() {
  try {
    // Check all HQ Settlements and their status
    const hqSettlements = await pool.query(`
      SELECT hs.id, hs.settlement_number, hs.summary_date, hs.status
      FROM hq_settlements hs
      ORDER BY hs.summary_date DESC
      LIMIT 10
    `);

    console.log('=== All Station Summaries (HQ Settlements) ===\n');

    for (const hs of hqSettlements.rows) {
      const summaries = await pool.query(`
        SELECT * FROM hq_settlement_summaries WHERE hq_settlement_id = $1 ORDER BY currency
      `, [hs.id]);

      console.log(`${hs.settlement_number} - Date: ${hs.summary_date} - Status: ${hs.status}`);
      summaries.rows.forEach(s => {
        console.log(`  ${s.currency}: Opening=${parseFloat(s.opening_balance || 0).toLocaleString()}, Cash from Stations=${parseFloat(s.cash_from_stations || 0).toLocaleString()}, HQ Expenses=${parseFloat(s.total_hq_expenses || 0).toLocaleString()}, Safe=${parseFloat(s.safe_amount || 0).toLocaleString()}`);
      });
      console.log('');
    }

    // Check submitted settlements and their cash
    console.log('\n=== Submitted/Review Settlements - Cash Sent ===\n');
    const settlements = await pool.query(`
      SELECT s.id, s.settlement_number, s.period_to, s.status, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.status IN ('SUBMITTED', 'REVIEW', 'APPROVED', 'APPROVED_WITH_VARIANCE')
      ORDER BY s.period_to DESC
      LIMIT 15
    `);

    for (const s of settlements.rows) {
      const summaries = await pool.query(`
        SELECT * FROM settlement_summaries WHERE settlement_id = $1 ORDER BY currency
      `, [s.id]);

      console.log(`${s.settlement_number} (${s.station_code}) - Period: ${s.period_to} - Status: ${s.status}`);
      summaries.rows.forEach(sum => {
        const cashSent = parseFloat(sum.station_declared_cash || sum.actual_cash_received || 0);
        console.log(`  ${sum.currency}: Cash Sent = ${cashSent.toLocaleString()}`);
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
