require('dotenv').config();
const { pool } = require('../src/config/db');

async function checkRecentSettlements() {
  try {
    // Get recently submitted settlements (last 24 hours)
    const recent = await pool.query(`
      SELECT s.settlement_number, s.status, s.period_from, s.period_to,
             s.submitted_at, st.station_name, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.status IN ('SUBMITTED', 'REVIEW')
      ORDER BY s.submitted_at DESC NULLS LAST, s.updated_at DESC
      LIMIT 10
    `);

    console.log('=== RECENT SUBMITTED/REVIEW SETTLEMENTS ===');
    recent.rows.forEach(r => {
      console.log(`${r.settlement_number} | ${r.station_code} | Period: ${r.period_from} to ${r.period_to} | Status: ${r.status} | Submitted: ${r.submitted_at}`);
    });

    // Get unique period_to dates from these settlements
    const dates = [...new Set(recent.rows.map(r => r.period_to))];
    console.log('\n=== UNIQUE PERIOD_TO DATES ===');
    dates.forEach(d => console.log(d));

    // Check HQ settlements for these dates
    console.log('\n=== HQ SETTLEMENTS STATUS ===');
    for (const date of dates) {
      const hq = await pool.query(`
        SELECT h.settlement_number, h.summary_date, h.status,
               (SELECT json_agg(json_build_object('currency', currency, 'cash_from_stations', cash_from_stations, 'safe_amount', safe_amount))
                FROM hq_settlement_summaries WHERE hq_settlement_id = h.id) as summaries
        FROM hq_settlements h
        WHERE h.summary_date = $1
      `, [date]);

      if (hq.rows.length > 0) {
        console.log(`\nDate ${date}:`);
        console.log(JSON.stringify(hq.rows[0], null, 2));
      } else {
        console.log(`\nDate ${date}: No HQ Settlement exists`);
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkRecentSettlements();
