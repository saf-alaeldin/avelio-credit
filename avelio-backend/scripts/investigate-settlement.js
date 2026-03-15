require('dotenv').config();
const { pool } = require('../src/config/db');

async function investigate() {
  try {
    // Get the settlement
    const settlement = await pool.query(`
      SELECT s.*, st.station_name, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE s.settlement_number = 'STL-WUU-20260113-001'
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
    console.log('Count:', agents.rows.length);
    console.log(JSON.stringify(agents.rows, null, 2));

    // Get expenses
    const expenses = await pool.query(`
      SELECT se.*, ec.code, ec.name
      FROM settlement_expenses se
      JOIN expense_codes ec ON se.expense_code_id = ec.id
      WHERE se.settlement_id = $1
    `, [settlementId]);
    console.log('\n=== EXPENSES ===');
    console.log('Count:', expenses.rows.length);
    console.log(JSON.stringify(expenses.rows, null, 2));

    // Get ALL audit logs for this settlement
    const auditLogs = await pool.query(`
      SELECT sal.*, u.name as user_name
      FROM settlement_audit_logs sal
      LEFT JOIN users u ON sal.user_id = u.id
      WHERE sal.settlement_id = $1
      ORDER BY sal.created_at DESC
    `, [settlementId]);
    console.log('\n=== AUDIT LOGS (All actions) ===');
    console.log('Count:', auditLogs.rows.length);
    auditLogs.rows.forEach((log, i) => {
      console.log(`\n--- Log ${i + 1} ---`);
      console.log('Action:', log.action);
      console.log('Time:', log.created_at);
      console.log('User:', log.user_name);
      console.log('Field:', log.field_changed);
      if (log.old_value) console.log('Old value:', log.old_value);
      if (log.new_value) console.log('New value:', log.new_value);
      if (log.notes) console.log('Notes:', log.notes);
    });

    // Check station_declared_cash specifically
    console.log('\n=== STATION DECLARED CASH CHECK ===');
    summaries.rows.forEach(s => {
      console.log(`${s.currency}: station_declared_cash = ${s.station_declared_cash}, actual_cash_received = ${s.actual_cash_received}`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

investigate();
