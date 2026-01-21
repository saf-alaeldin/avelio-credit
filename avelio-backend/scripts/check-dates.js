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
  const result = await pool.query(`
    SELECT id, summary_date, created_at, status
    FROM hq_settlements
    ORDER BY summary_date
  `);

  console.log('HQ Settlements - Summary Date vs Created At:');
  result.rows.forEach(r => {
    console.log('Summary Date:', r.summary_date.toISOString().split('T')[0],
                '| Created At:', r.created_at.toISOString().split('T')[0],
                '| Status:', r.status);
  });

  await pool.end();
})();
