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
    // Check ALL station settlements with station_declared_cash
    console.log('=== ALL Station Settlements with Declared Cash (USD) ===\n');
    const allDeclared = await pool.query(`
      SELECT s.id, st.station_name, s.period_from, s.period_to, s.status, s.created_at, s.updated_at,
             ss.currency, ss.actual_cash_received, ss.station_declared_cash
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE ss.currency = 'USD'
        AND ss.station_declared_cash IS NOT NULL
      ORDER BY s.period_to DESC, st.station_name
    `);

    allDeclared.rows.forEach(r => {
      console.log(`${r.station_name} (${r.status}):`);
      console.log(`  Period: ${r.period_to.toISOString().split('T')[0]}`);
      console.log(`  Actual Cash: ${r.actual_cash_received}, Declared Cash: ${r.station_declared_cash}`);
      console.log(`  Updated: ${r.updated_at}`);
      console.log('');
    });

    // Check settlements for Jan 15 and Jan 16 specifically
    console.log('\n=== Jan 15 Station Settlements (all stations) ===\n');
    const jan15All = await pool.query(`
      SELECT st.station_name, s.status, ss.currency,
             ss.actual_cash_received, ss.station_declared_cash
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.period_to::date = '2026-01-15'
      ORDER BY st.station_name, ss.currency
    `);

    jan15All.rows.forEach(r => {
      console.log(`${r.station_name} (${r.status}) - ${r.currency}: Actual=${r.actual_cash_received}, Declared=${r.station_declared_cash}`);
    });

    console.log('\n=== Jan 16 Station Settlements (all stations) ===\n');
    const jan16All = await pool.query(`
      SELECT st.station_name, s.status, ss.currency,
             ss.actual_cash_received, ss.station_declared_cash
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.period_to::date = '2026-01-16'
      ORDER BY st.station_name, ss.currency
    `);

    if (jan16All.rows.length === 0) {
      console.log('No Jan 16 station settlements found');
    } else {
      jan16All.rows.forEach(r => {
        console.log(`${r.station_name} (${r.status}) - ${r.currency}: Actual=${r.actual_cash_received}, Declared=${r.station_declared_cash}`);
      });
    }

    // Calculate what SHOULD be included in today's HQ summary
    console.log('\n\n=== Cash that should be included in Jan 16 HQ Summary ===\n');

    // Sum all station_declared_cash for Jan 16 period
    const jan16Cash = await pool.query(`
      SELECT COALESCE(SUM(ss.station_declared_cash), 0) as total
      FROM settlements s
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE s.period_to::date = '2026-01-16'
        AND ss.currency = 'USD'
        AND ss.station_declared_cash IS NOT NULL
    `);
    console.log(`Jan 16 station_declared_cash total: ${jan16Cash.rows[0].total}`);

    // Also check if there are settlements from other dates that were updated today
    console.log('\n=== Settlements updated today (Jan 16) ===\n');
    const updatedToday = await pool.query(`
      SELECT st.station_name, s.period_to, s.status, ss.currency,
             ss.actual_cash_received, ss.station_declared_cash, ss.updated_at
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      JOIN settlement_summaries ss ON s.id = ss.settlement_id
      WHERE ss.updated_at::date = CURRENT_DATE
        AND ss.currency = 'USD'
      ORDER BY ss.updated_at DESC
    `);

    updatedToday.rows.forEach(r => {
      console.log(`${r.station_name} (Period: ${r.period_to.toISOString().split('T')[0]}, Status: ${r.status}):`);
      console.log(`  ${r.currency}: Actual=${r.actual_cash_received}, Declared=${r.station_declared_cash}`);
      console.log(`  Updated: ${r.updated_at}`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
