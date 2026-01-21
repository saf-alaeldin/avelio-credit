const db = require('../src/config/db');

async function check() {
  try {
    // Get recent station summaries (hq_settlements)
    const summaries = await db.query(`
      SELECT hs.id, hs.settlement_number, hs.summary_date, hs.status,
             hss.currency, hss.opening_balance, hss.cash_from_stations,
             hss.total_available, hss.total_hq_expenses, hss.safe_amount
      FROM hq_settlements hs
      LEFT JOIN hq_settlement_summaries hss ON hs.id = hss.hq_settlement_id
      ORDER BY hs.summary_date DESC
      LIMIT 20
    `);

    console.log('\n=== Recent Station Summaries ===\n');
    let currentDate = null;
    summaries.rows.forEach(r => {
      const date = r.summary_date?.toISOString?.().split('T')[0] || r.summary_date;
      if (date !== currentDate) {
        currentDate = date;
        console.log(`\n📅 Date: ${date} | Status: ${r.status}`);
        console.log('----------------------------------------');
      }
      if (r.currency) {
        console.log(`  ${r.currency}:`);
        console.log(`    Opening Balance:    ${r.opening_balance}`);
        console.log(`    Cash from Stations: ${r.cash_from_stations}`);
        console.log(`    Total Available:    ${r.total_available}`);
        console.log(`    HQ Expenses:        ${r.total_hq_expenses}`);
        console.log(`    TO SAFE:            ${r.safe_amount}`);
      }
    });

    // Check what getOpeningBalance would return for today
    const today = new Date().toISOString().split('T')[0];
    console.log(`\n\n=== Opening Balance Check for TODAY (${today}) ===\n`);

    for (const currency of ['USD', 'SSP']) {
      const result = await db.query(`
        SELECT hss.safe_amount, hs.summary_date, hs.status
        FROM hq_settlement_summaries hss
        JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
        WHERE hs.status = 'CLOSED'
          AND hs.summary_date < $1
          AND hss.currency = $2
        ORDER BY hs.summary_date DESC
        LIMIT 1
      `, [today, currency]);

      if (result.rows.length > 0) {
        const r = result.rows[0];
        const date = r.summary_date?.toISOString?.().split('T')[0] || r.summary_date;
        console.log(`${currency}: Opening balance = ${r.safe_amount} (from ${date}, status: ${r.status})`);
      } else {
        console.log(`${currency}: Opening balance = 0 (NO CLOSED summary found before ${today})`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();
