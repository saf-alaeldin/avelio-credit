const db = require('../src/config/db');

async function investigate() {
  try {
    // Check audit logs for any deletions around Jan 15
    const auditLogs = await db.query(`
      SELECT * FROM hq_settlement_audit_logs
      WHERE created_at >= '2026-01-14'
      ORDER BY created_at DESC
      LIMIT 30
    `);
    console.log('=== Recent HQ Audit Logs ===');
    auditLogs.rows.forEach(l => {
      console.log(`${l.created_at} - ${l.action}: ${l.notes || ''}`);
      if (l.old_value) console.log(`  Old: ${l.old_value}`);
      if (l.new_value) console.log(`  New: ${l.new_value}`);
    });

    // Check if there's a deleted settlements table or soft delete
    const settlementHistory = await db.query(`
      SELECT s.*, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE st.station_code = 'JUB'
      ORDER BY s.created_at DESC
      LIMIT 10
    `);
    console.log('\n=== Recent Juba Settlements ===');
    settlementHistory.rows.forEach(s => {
      console.log(`Created: ${s.created_at}, Period: ${s.period_from} to ${s.period_to}, Status: ${s.status}`);
    });

    // Check the Jan 14 settlement details - this should be the one with cash
    const jan14Settlement = await db.query(`
      SELECT s.*, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE st.station_code = 'JUB' AND s.period_to = '2026-01-14'
    `);

    if (jan14Settlement.rows.length > 0) {
      const sid = jan14Settlement.rows[0].id;
      console.log('\n=== Jan 14 Juba Settlement Details ===');
      console.log('Settlement ID:', sid);
      console.log('Status:', jan14Settlement.rows[0].status);

      const summaries = await db.query(`SELECT * FROM settlement_summaries WHERE settlement_id = $1`, [sid]);
      console.log('\nSummaries:');
      summaries.rows.forEach(s => {
        console.log(`  ${s.currency}: station_declared_cash=${s.station_declared_cash}, actual_cash=${s.actual_cash_received}`);
      });

      const agentSettlements = await db.query(`
        SELECT a.*, sa.agent_name
        FROM agent_settlements a
        JOIN sales_agents sa ON a.agent_id = sa.id
        WHERE a.settlement_id = $1
        ORDER BY sa.agent_name
      `, [sid]);
      console.log('\nAgent Settlements:');
      agentSettlements.rows.forEach(a => {
        console.log(`  ${a.agent_name} - ${a.currency}: sales=${a.total_sales}, cash_sent=${a.cash_sent}`);
      });
    }

    // Check what the getCashFromStations query would return for Jan 15
    console.log('\n=== getCashFromStations Query Result for Jan 15 ===');
    const cashQuery = await db.query(`
      SELECT s.id, s.status, s.period_to, ss.currency, ss.station_declared_cash, ss.actual_cash_received
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      WHERE s.status IN ('SUBMITTED', 'REVIEW')
        AND s.period_to = '2026-01-15'
    `);
    console.log(`Found: ${cashQuery.rows.length} rows`);
    cashQuery.rows.forEach(r => {
      console.log(`  ${r.currency}: declared=${r.station_declared_cash}, actual=${r.actual_cash_received}`);
    });

    // Also check for Jan 14
    console.log('\n=== getCashFromStations Query Result for Jan 14 ===');
    const cashQuery14 = await db.query(`
      SELECT s.id, s.status, s.period_to, ss.currency, ss.station_declared_cash, ss.actual_cash_received
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      WHERE s.status IN ('SUBMITTED', 'REVIEW')
        AND s.period_to = '2026-01-14'
    `);
    console.log(`Found: ${cashQuery14.rows.length} rows`);
    cashQuery14.rows.forEach(r => {
      console.log(`  ${r.currency}: declared=${r.station_declared_cash}, actual=${r.actual_cash_received}`);
    });

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message, e.stack);
    process.exit(1);
  }
}

investigate();
