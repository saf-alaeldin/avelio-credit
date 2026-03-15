require('dotenv').config();
const { pool } = require('../src/config/db');

async function checkSettlement() {
  try {
    // Get the settlement
    const settlement = await pool.query(`
      SELECT s.*, st.station_name, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.settlement_number = 'STL-JUB-20260114-001'
    `);
    console.log('=== SETTLEMENT ===');
    console.log(JSON.stringify(settlement.rows[0], null, 2));

    if (settlement.rows.length === 0) {
      console.log('Settlement not found');
      return;
    }

    const settlementId = settlement.rows[0].id;

    // Get settlement summaries
    const summaries = await pool.query(`
      SELECT * FROM settlement_summaries WHERE settlement_id = $1
    `, [settlementId]);
    console.log('\n=== SETTLEMENT SUMMARIES ===');
    console.log(JSON.stringify(summaries.rows, null, 2));

    // Get agent entries
    const agents = await pool.query(`
      SELECT sae.*, sa.agent_name, sa.agent_code
      FROM settlement_agent_entries sae
      LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE sae.settlement_id = $1
      ORDER BY sae.currency, sa.agent_name
    `, [settlementId]);
    console.log('\n=== AGENT ENTRIES ===');
    console.log(JSON.stringify(agents.rows, null, 2));

    // Calculate totals manually
    let totalUSD = 0;
    let totalSSP = 0;
    for (const agent of agents.rows) {
      const cashReceived = parseFloat(agent.cash_received) || 0;
      if (agent.currency === 'USD') {
        totalUSD += cashReceived;
      } else if (agent.currency === 'SSP') {
        totalSSP += cashReceived;
      }
    }
    console.log('\n=== MANUAL CALCULATION ===');
    console.log('Total USD from agents:', totalUSD);
    console.log('Total SSP from agents:', totalSSP);

    // Get expenses
    const expenses = await pool.query(`
      SELECT se.*, ec.code, ec.name
      FROM settlement_expenses se
      JOIN expense_codes ec ON se.expense_code_id = ec.id
      WHERE se.settlement_id = $1
    `, [settlementId]);
    console.log('\n=== EXPENSES ===');
    console.log(JSON.stringify(expenses.rows, null, 2));

    let expenseUSD = 0;
    let expenseSSP = 0;
    for (const exp of expenses.rows) {
      const amount = parseFloat(exp.amount) || 0;
      if (exp.currency === 'USD') {
        expenseUSD += amount;
      } else if (exp.currency === 'SSP') {
        expenseSSP += amount;
      }
    }
    console.log('\n=== EXPENSE TOTALS ===');
    console.log('Total USD expenses:', expenseUSD);
    console.log('Total SSP expenses:', expenseSSP);

    console.log('\n=== EXPECTED NET CASH ===');
    console.log('USD: ', totalUSD, ' - ', expenseUSD, ' = ', totalUSD - expenseUSD);
    console.log('SSP: ', totalSSP, ' - ', expenseSSP, ' = ', totalSSP - expenseSSP);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkSettlement();
