const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'avelio_db',
  user: 'postgres',
  password: 'postgres123'
});

async function checkTables() {
  try {
    // Check if station_sales table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'station_sales'
      );
    `);
    console.log('station_sales table exists:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      // Count sales
      const countResult = await pool.query('SELECT COUNT(*) FROM station_sales');
      console.log('Number of sales:', countResult.rows[0].count);
    }

    // Check stations
    const stationsCheck = await pool.query('SELECT COUNT(*) FROM stations');
    console.log('Number of stations:', stationsCheck.rows[0].count);

    // Check sales_agents
    const agentsCheck = await pool.query('SELECT COUNT(*) FROM sales_agents');
    console.log('Number of sales agents:', agentsCheck.rows[0].count);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

checkTables();
