const { Pool, types } = require('pg');
require('dotenv').config();

types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'avelio_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
});

async function checkDeletedSales() {
  const client = await pool.connect();
  try {
    // Check audit logs for deleted sales on Jan 17
    const auditLogs = await client.query(`
      SELECT * FROM settlement_audit_logs
      WHERE action LIKE '%DELETE%' OR action LIKE '%SALE%'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.log('=== RECENT AUDIT LOGS (DELETES/SALES) ===');
    auditLogs.rows.forEach(r => {
      console.log(`${r.created_at}: ${r.action}`);
      if (r.changes) console.log(`  Changes: ${JSON.stringify(r.changes).substring(0, 200)}`);
    });

    // Check general audit logs
    const generalAudit = await client.query(`
      SELECT * FROM audit_logs
      WHERE action LIKE '%DELETE%' OR action LIKE '%delete%'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.log('\n=== GENERAL AUDIT LOGS (DELETES) ===');
    generalAudit.rows.forEach(r => {
      console.log(`${r.created_at}: ${r.action} on ${r.entity_type}`);
      if (r.old_values) console.log(`  Old: ${JSON.stringify(r.old_values).substring(0, 200)}`);
    });

    // Check if there's any orphaned settlement data
    const orphanedEntries = await client.query(`
      SELECT sae.*, s.period_to
      FROM settlement_agent_entries sae
      LEFT JOIN settlements s ON sae.settlement_id = s.id
      WHERE s.id IS NULL
    `);
    console.log('\n=== ORPHANED SETTLEMENT ENTRIES ===');
    if (orphanedEntries.rows.length === 0) {
      console.log('No orphaned entries found');
    } else {
      console.log(orphanedEntries.rows);
    }

    // Count station sales by date for Kushair Traffic POS
    const malikId = '82e5310e-fc19-4c37-8620-bad40e03bba6';
    const salesCount = await client.query(`
      SELECT transaction_date, COUNT(*) as count, SUM(sales_amount) as total
      FROM station_sales
      WHERE agent_id = $1
      GROUP BY transaction_date
      ORDER BY transaction_date DESC
    `, [malikId]);
    console.log('\n=== MALIK SALES COUNT BY DATE ===');
    salesCount.rows.forEach(r => {
      console.log(`${r.transaction_date}: ${r.count} sales, total ${r.total} SSP`);
    });

  } finally {
    client.release();
    pool.end();
  }
}

checkDeletedSales().catch(console.error);
