const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

(async () => {
  try {
    // Check all HQ settlements
    console.log('=== ALL HQ Settlements ===');
    const hqSettlements = await pool.query(`
      SELECT hs.*, hss.currency, hss.opening_balance, hss.cash_from_stations,
             hss.total_available, hss.total_hq_expenses, hss.safe_amount
      FROM hq_settlements hs
      LEFT JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      ORDER BY hs.summary_date DESC, hss.currency
    `);

    let currentDate = null;
    hqSettlements.rows.forEach(h => {
      const date = h.summary_date ? h.summary_date.toISOString().split('T')[0] : 'N/A';
      if (date !== currentDate) {
        console.log(`\n--- ${date} (Status: ${h.status}) ---`);
        currentDate = date;
      }
      if (h.currency) {
        console.log(`  ${h.currency}: Opening=${h.opening_balance}, FromStations=${h.cash_from_stations}, Available=${h.total_available}, Expenses=${h.total_hq_expenses}, Safe=${h.safe_amount}`);
      }
    });

    // Check for value 41630 specifically
    console.log('\n\n=== Search for 41630 value ===');
    const search = await pool.query(`
      SELECT hs.summary_date, hs.status, hss.*
      FROM hq_settlement_summaries hss
      JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
      WHERE hss.opening_balance::numeric BETWEEN 41600 AND 41700
         OR hss.cash_from_stations::numeric BETWEEN 41600 AND 41700
         OR hss.total_available::numeric BETWEEN 41600 AND 41700
         OR hss.safe_amount::numeric BETWEEN 41600 AND 41700
    `);

    if (search.rows.length === 0) {
      console.log('No exact match for 41630 found');
    } else {
      search.rows.forEach(r => {
        console.log(`Date: ${r.summary_date}, Currency: ${r.currency}`);
        console.log(`  Opening=${r.opening_balance}, FromStations=${r.cash_from_stations}, Available=${r.total_available}, Safe=${r.safe_amount}`);
      });
    }

    // Check what CLOSED summaries exist (these provide opening balances)
    console.log('\n\n=== CLOSED HQ Settlements (provide opening balance) ===');
    const closed = await pool.query(`
      SELECT hs.summary_date, hs.status, hss.currency, hss.safe_amount
      FROM hq_settlements hs
      JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      WHERE hs.status = 'CLOSED'
      ORDER BY hs.summary_date DESC
    `);

    if (closed.rows.length === 0) {
      console.log('No CLOSED settlements - opening balance should be 0');
    } else {
      closed.rows.forEach(c => {
        console.log(`${c.summary_date}: ${c.currency} safe_amount = ${c.safe_amount}`);
      });
    }

    // Check station settlements that feed into HQ
    console.log('\n\n=== Station Settlement Summaries for Jan 16 ===');
    const stationSums = await pool.query(`
      SELECT s.id, st.station_name, s.period_to, s.status,
             ss.currency, ss.actual_cash_received, ss.station_declared_cash
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.period_to::date = '2026-01-16'
      ORDER BY st.station_name, ss.currency
    `);

    if (stationSums.rows.length === 0) {
      console.log('No Jan 16 station settlements');
    } else {
      stationSums.rows.forEach(s => {
        console.log(`${s.station_name} (${s.status}): ${s.currency} - Actual=${s.actual_cash_received}, Station Declared=${s.station_declared_cash}`);
      });
    }

    // Check Jan 15 station settlements that might be feeding Jan 16
    console.log('\n\n=== Station Settlement Summaries for Jan 15 ===');
    const jan15Sums = await pool.query(`
      SELECT s.id, st.station_name, s.period_to, s.status,
             ss.currency, ss.actual_cash_received, ss.station_declared_cash
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.period_to::date = '2026-01-15'
      ORDER BY st.station_name, ss.currency
    `);

    jan15Sums.rows.forEach(s => {
      console.log(`${s.station_name} (${s.status}): ${s.currency} - Actual=${s.actual_cash_received}, Station Declared=${s.station_declared_cash}`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
