// Update Sarah Lado credentials
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

async function updateSarahCredentials() {
  try {
    console.log('Updating Sarah Lado credentials...');

    // Hash the new password
    const hashedPassword = await bcrypt.hash('sarah', 10);

    // Update user
    const result = await pool.query(
      `UPDATE users
       SET username = $1, password_hash = $2
       WHERE email = $3 OR username = $4
       RETURNING name, username, email, role`,
      ['sarah', hashedPassword, 'sarah.lado@kushair.net', 'sarah.lado']
    );

    if (result.rows.length > 0) {
      console.log('✅ User updated successfully:');
      console.log('   Name:', result.rows[0].name);
      console.log('   Username:', result.rows[0].username);
      console.log('   Password: sarah');
      console.log('   Role:', result.rows[0].role);
    } else {
      console.log('❌ User not found');
    }

  } catch (error) {
    console.error('❌ Update failed:', error.message);
  } finally {
    await pool.end();
  }
}

updateSarahCredentials();
