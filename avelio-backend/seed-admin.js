// Script to create an admin user for Avelio Credit system
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// Database connection - supports both local and Render (DATABASE_URL)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

async function createAdminUser() {
  try {
    console.log('🔐 Creating admin user for Avelio Credit...');
    console.log('');

    // Admin credentials
    const email = 'admin@avelio.com';
    const password = 'Admin@123'; // Strong default password
    const saltRounds = 10;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert admin user
    const result = await pool.query(
      `INSERT INTO users
       (email, name, password_hash, employee_id, station_code, role, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         is_active = true,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, email, name, station_code, role`,
      [
        email,
        'System Administrator',
        hashedPassword,
        'ADM-001',
        'JUB',
        'admin',
        '+211-XXX-ADMIN',
        true
      ]
    );

    console.log('✅ Admin user created/updated successfully!');
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('📋 ADMIN USER DETAILS');
    console.log('═══════════════════════════════════════════');
    console.log('   Name:     ', result.rows[0].name);
    console.log('   Email:    ', result.rows[0].email);
    console.log('   Role:     ', result.rows[0].role);
    console.log('   Station:  ', result.rows[0].station_code);
    console.log('');
    console.log('🔑 LOGIN CREDENTIALS');
    console.log('═══════════════════════════════════════════');
    console.log('   Email:    admin@avelio.com');
    console.log('   Password: Admin@123');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
    console.log('');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Make sure the database is running');
    console.error('2. Check your .env file has correct database credentials');
    console.error('3. Verify the users table exists (run schema.sql if needed)');
  } finally {
    await pool.end();
    process.exit(0);
  }
}

createAdminUser();
