const db = require('../src/config/db');

function formatDate(d) {
  if (!d) return 'N/A';
  return String(d).split('T')[0];
}

async function run() {
  const stationId = '2a05e6c5-30b7-49dc-a4e4-cf947d5233c5';
  const agentId = '75cd6cb5-eb05-4a6f-a126-8a730288ccf4';

  // Station info
  const st = await db.query('SELECT station_name FROM stations WHERE id = $1', [stationId]);
  console.log('Mohamed Saeed station:', st.rows[0]?.station_name);

  // All entries for this agent
  const entries = await db.query(`
    SELECT sae.currency, sae.expected_cash, sae.declared_cash, s.period_to, s.status
    FROM settlement_agent_entries sae
    JOIN settlements s ON sae.settlement_id = s.id
    WHERE sae.agent_id = $1
    ORDER BY s.period_to DESC
  `, [agentId]);

  console.log('\nMohamed Saeed entries:', entries.rows.length);
  entries.rows.forEach(e => {
    console.log(`  ${formatDate(e.period_to)} ${e.currency}: expected=${e.expected_cash}, declared=${e.declared_cash} (${e.status})`);
  });

  // Check Jan 19 settlement for Juba
  const jan19 = await db.query(`
    SELECT s.id, s.status, st.station_name
    FROM settlements s
    JOIN stations st ON s.station_id = st.id
    WHERE s.period_to = '2026-01-19' AND s.station_id = $1
  `, [stationId]);

  console.log('\nJan 19 settlement for Juba:', jan19.rows.length > 0 ? jan19.rows[0] : 'NOT FOUND');

  // Check all Jan 19 settlements
  const allJan19 = await db.query(`
    SELECT s.id, s.status, st.station_name
    FROM settlements s
    JOIN stations st ON s.station_id = st.id
    WHERE s.period_to = '2026-01-19'
  `);

  console.log('\nAll Jan 19 settlements:');
  allJan19.rows.forEach(s => console.log(`  ${s.station_name} - ${s.status}`));

  // Check audit logs for declared cash entries with 130
  const auditLogs = await db.query(`
    SELECT sal.created_at, sal.action, sal.field_changed, sal.old_value, sal.new_value, sal.notes,
           s.period_to, st.station_name
    FROM settlement_audit_logs sal
    JOIN settlements s ON sal.settlement_id = s.id
    JOIN stations st ON s.station_id = st.id
    WHERE sal.new_value LIKE '%130%' OR sal.old_value LIKE '%130%'
    ORDER BY sal.created_at DESC
    LIMIT 20
  `);

  console.log('\nAudit logs with value 130:');
  auditLogs.rows.forEach(log => {
    console.log(`  ${log.created_at} | ${log.station_name} ${formatDate(log.period_to)}`);
    console.log(`    Action: ${log.action}, Field: ${log.field_changed}`);
    console.log(`    Old: ${log.old_value}, New: ${log.new_value}`);
  });

  // Check for any RECALCULATE actions on Juba
  const recalcLogs = await db.query(`
    SELECT sal.created_at, sal.action, s.period_to, st.station_name
    FROM settlement_audit_logs sal
    JOIN settlements s ON sal.settlement_id = s.id
    JOIN stations st ON s.station_id = st.id
    WHERE sal.action = 'RECALCULATE' AND s.station_id = $1
    ORDER BY sal.created_at DESC
    LIMIT 10
  `, [stationId]);

  console.log('\nRecalculate actions on Juba:');
  recalcLogs.rows.forEach(log => {
    console.log(`  ${log.created_at} | ${formatDate(log.period_to)}`);
  });

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
