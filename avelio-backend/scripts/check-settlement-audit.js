const db = require('../src/config/db');

async function check() {
  try {
    // Check settlement audit logs for deletions or changes
    const auditLogs = await db.query(`
      SELECT sal.*, u.name as user_name
      FROM settlement_audit_logs sal
      LEFT JOIN users u ON sal.user_id = u.id
      WHERE sal.created_at >= '2026-01-14'
      ORDER BY sal.created_at DESC
      LIMIT 30
    `);

    console.log('=== Recent Settlement Audit Logs ===\n');
    auditLogs.rows.forEach(l => {
      console.log(`${l.created_at} - ${l.action} by ${l.user_name || 'Unknown'}`);
      if (l.notes) console.log(`  Notes: ${l.notes}`);
      if (l.field_changed) console.log(`  Field: ${l.field_changed}`);
      console.log('');
    });

    // Check if any settlements were deleted
    console.log('\n=== Checking for DELETE actions ===');
    const deleteActions = auditLogs.rows.filter(l => l.action.includes('DELETE'));
    if (deleteActions.length > 0) {
      console.log('Found DELETE actions:');
      deleteActions.forEach(d => console.log(`  - ${d.created_at}: ${d.action}`));
    } else {
      console.log('No DELETE actions found');
    }

    // Check all Juba settlements ever created
    console.log('\n=== All Juba Settlements ===');
    const allJubaSettlements = await db.query(`
      SELECT s.*, st.station_code
      FROM settlements s
      JOIN stations st ON s.station_id = st.id
      WHERE st.station_code = 'JUB'
      ORDER BY s.period_to DESC
    `);
    console.log(`Total Juba settlements: ${allJubaSettlements.rows.length}`);
    allJubaSettlements.rows.forEach(s => {
      console.log(`  ${s.period_from} to ${s.period_to}: ${s.status} (created: ${s.created_at})`);
    });

    // Check settlement_summaries for Jan 15
    console.log('\n=== Settlement Summaries for Jan 15 ===');
    const jan15Summaries = await db.query(`
      SELECT ss.*, s.period_to, st.station_code
      FROM settlement_summaries ss
      JOIN settlements s ON ss.settlement_id = s.id
      JOIN stations st ON s.station_id = st.id
      WHERE s.period_to = '2026-01-15'
    `);
    if (jan15Summaries.rows.length === 0) {
      console.log('NO settlement summaries exist for Jan 15');
    } else {
      jan15Summaries.rows.forEach(s => {
        console.log(`  ${s.station_code} - ${s.currency}:`);
        console.log(`    station_declared_cash: ${s.station_declared_cash}`);
        console.log(`    actual_cash_received: ${s.actual_cash_received}`);
      });
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

check();
