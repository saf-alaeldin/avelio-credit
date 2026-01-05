const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'avelio_db',
  user: 'postgres',
  password: 'postgres123'
});

async function createTestUser() {
  try {
    const passwordHash = await bcrypt.hash('Test@123', 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, station_code, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2
       RETURNING id, email, role`,
      ['testadmin@kushair.net', passwordHash, 'Test Admin', 'JUB', 'admin']
    );
    console.log('Created user:', result.rows[0]);
    console.log('Password: Test@123');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

createTestUser();
