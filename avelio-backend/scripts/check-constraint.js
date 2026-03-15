const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'avelio_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
});

async function checkConstraint() {
  const client = await pool.connect();
  try {
    // Check constraint definition
    const constraint = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conname = 'valid_summary_variance_status'
    `);
    console.log('Constraint:', constraint.rows[0]);

    // Check existing summaries for valid status values
    const statuses = await client.query(`
      SELECT DISTINCT variance_status FROM settlement_summaries WHERE variance_status IS NOT NULL LIMIT 10
    `);
    console.log('\nExisting variance statuses:', statuses.rows);

    // Check if the settlement was partially created
    const settlement = await client.query(`
      SELECT * FROM settlements WHERE period_to = '2026-01-17' AND station_id = '2a05e6c5-30b7-49dc-a4e4-cf947d5233c5'
    `);
    console.log('\nJan 17 Settlement:', settlement.rows);

    // Check entries
    if (settlement.rows.length > 0) {
      const entries = await client.query(`
        SELECT sae.*, sa.agent_name
        FROM settlement_agent_entries sae
        LEFT JOIN sales_agents sa ON sae.agent_id = sa.id
        WHERE sae.settlement_id = $1
      `, [settlement.rows[0].id]);
      console.log('\nSettlement entries:', entries.rows.length);
    }

  } finally {
    client.release();
    pool.end();
  }
}

checkConstraint().catch(console.error);
