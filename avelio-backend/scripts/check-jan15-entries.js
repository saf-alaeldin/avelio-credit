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
    const settlementId = '11546293-9b4c-464c-a2a5-f631bb42c74d';

    // Get agent entries
    console.log('=== Agent Entries ===');
    const entries = await pool.query(`
      SELECT sae.*, sa.agent_name, sa.point_of_sale
      FROM settlement_agent_entries sae
      LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
      WHERE sae.settlement_id = $1
      ORDER BY sae.currency, sa.agent_name
    `, [settlementId]);

    entries.rows.forEach(e => {
      console.log(`${e.currency} - ${e.agent_name || 'N/A'} (${e.point_of_sale || 'N/A'}): Expected=${e.expected_cash}, Declared=${e.declared_cash}`);
    });

    // Get expenses
    console.log('\n=== Expenses ===');
    const expenses = await pool.query(`
      SELECT se.*, ec.name as expense_name
      FROM settlement_expenses se
      JOIN expense_codes ec ON se.expense_code_id = ec.id
      WHERE se.settlement_id = $1
      ORDER BY se.currency
    `, [settlementId]);

    expenses.rows.forEach(e => {
      console.log(`${e.currency} - ${e.expense_name}: ${e.amount}`);
    });

    // Get sales
    console.log('\n=== Sales ===');
    const sales = await pool.query(`
      SELECT ss.*, sa.agent_name, sa.point_of_sale as agent_pos
      FROM station_sales ss
      LEFT JOIN sales_agents sa ON ss.agent_id = sa.id
      WHERE ss.settlement_id = $1
      ORDER BY ss.currency, sa.agent_name
    `, [settlementId]);

    sales.rows.forEach(s => {
      const net = (parseFloat(s.sales_amount || s.amount || 0) - parseFloat(s.cashout_amount || 0));
      console.log(`${s.currency} - ${s.agent_name || 'N/A'} (Sale POS: ${s.point_of_sale}, Agent POS: ${s.agent_pos}): Sales=${s.sales_amount || s.amount}, Cashout=${s.cashout_amount || 0}, Net=${net}`);
    });

    // Sum by currency
    console.log('\n=== Totals by Currency ===');
    const totals = await pool.query(`
      SELECT currency,
             SUM(COALESCE(sales_amount, amount, 0) - COALESCE(cashout_amount, 0)) as total_sales
      FROM station_sales
      WHERE settlement_id = $1
      GROUP BY currency
    `, [settlementId]);

    totals.rows.forEach(t => {
      console.log(`${t.currency}: Total Sales = ${t.total_sales}`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
})();
