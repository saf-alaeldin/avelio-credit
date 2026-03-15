require('dotenv').config();
const { pool } = require('../src/config/db');

async function checkWauExpense() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Checking for date:', today);

    // Find Wau settlement (any date)
    const wauSettlements = await pool.query(`
      SELECT s.*, st.station_name, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE st.station_code = 'WUU'
      ORDER BY s.period_to DESC
      LIMIT 5
    `);

    console.log('\n=== Recent Wau Settlements ===');
    wauSettlements.rows.forEach(s => {
      console.log(`  ${s.settlement_number}: ${s.period_to} - Status: ${s.status}`);
    });

    // Check latest Wau settlement expenses
    if (wauSettlements.rows.length > 0) {
      const latestSettlement = wauSettlements.rows[0];
      console.log(`\n=== Wau Settlement ${latestSettlement.settlement_number} Expenses ===`);

      const expenses = await pool.query(`
        SELECT se.*, ec.name as expense_name
        FROM settlement_expenses se
        LEFT JOIN expense_codes ec ON se.expense_code_id = ec.id
        WHERE se.settlement_id = $1
        ORDER BY se.currency, se.created_at DESC
      `, [latestSettlement.id]);

      if (expenses.rows.length === 0) {
        console.log('No expenses found');
      } else {
        let totalSSP = 0, totalUSD = 0;
        expenses.rows.forEach(e => {
          const amt = parseFloat(e.amount);
          if (e.currency === 'SSP') totalSSP += amt;
          else totalUSD += amt;
          console.log(`  ${e.expense_name}: ${e.currency} ${amt.toLocaleString()}`);
        });
        console.log(`\n  Total USD: ${totalUSD.toLocaleString()}`);
        console.log(`  Total SSP: ${totalSSP.toLocaleString()}`);
      }

      // Check settlement summary
      const summary = await pool.query(`
        SELECT * FROM settlement_summaries WHERE settlement_id = $1 ORDER BY currency
      `, [latestSettlement.id]);

      console.log(`\n=== Wau Settlement Summary ===`);
      summary.rows.forEach(s => {
        console.log(`\n${s.currency}:`);
        console.log(`  Expected Cash:       ${parseFloat(s.expected_cash || 0).toLocaleString()}`);
        console.log(`  Total Expenses:      ${parseFloat(s.total_expenses || 0).toLocaleString()}`);
        console.log(`  Expected Net:        ${parseFloat(s.expected_net_cash || 0).toLocaleString()}`);
        console.log(`  Cash Sent (declared): ${parseFloat(s.station_declared_cash || 0).toLocaleString()}`);
        console.log(`  Actual Received:     ${parseFloat(s.actual_cash_received || 0).toLocaleString()}`);
      });
    }

    // Check HQ Settlement summary for today
    const hqSummary = await pool.query(`
      SELECT hss.*, hs.status, hs.summary_date
      FROM hq_settlement_summaries hss
      JOIN hq_settlements hs ON hss.hq_settlement_id = hs.id
      WHERE hs.summary_date = $1
      ORDER BY hss.currency
    `, [today]);

    console.log('\n=== Station Summary (HQ) for Today ===');
    if (hqSummary.rows.length === 0) {
      console.log('No HQ settlement found for today');
    } else {
      hqSummary.rows.forEach(s => {
        console.log(`\n${s.currency}:`);
        console.log(`  Opening Balance:      ${parseFloat(s.opening_balance).toLocaleString()}`);
        console.log(`  + Cash from Stations: ${parseFloat(s.cash_from_stations).toLocaleString()}`);
        console.log(`  = Total Available:    ${parseFloat(s.total_available).toLocaleString()}`);
        console.log(`  - HQ Expenses:        ${parseFloat(s.total_hq_expenses).toLocaleString()}`);
        console.log(`  = TO SAFE:            ${parseFloat(s.safe_amount).toLocaleString()}`);
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkWauExpense();
