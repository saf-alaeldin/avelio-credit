// Kush Air Credit System - Production Setup Script
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// Database connection
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

const users = [
  {
    username: 'mohamed.saeed',
    name: 'Mohamed Saeed',
    email: 'mohamed.saeed@kushair.net',
    password: 'KushAir@2025',
    employee_id: 'ADM-001',
    station_code: 'JUB',
    role: 'admin',
    phone: '+211929754555'
  },
  {
    username: 'ahmed.sami',
    name: 'Ahmed Sami',
    email: 'ahmed.sami@kushair.net',
    password: 'KushAir@2025',
    employee_id: 'STF-002',
    station_code: 'JUB',
    role: 'staff',
    phone: '+211929754556'
  },
  {
    username: 'sarah.lado',
    name: 'Sarah Lado',
    email: 'sarah.lado@kushair.net',
    password: 'KushAir@2025',
    employee_id: 'STF-003',
    station_code: 'JUB',
    role: 'staff',
    phone: '+211929754557'
  }
];

async function setupProduction() {
  try {
    console.log('');
    console.log('════════════════════════════════════════════════════');
    console.log('🛫 KUSH AIR CREDIT SYSTEM - PRODUCTION SETUP');
    console.log('════════════════════════════════════════════════════');
    console.log('');

    // Step 1: Add username column if it doesn't exist
    console.log('Step 1: Checking database schema...');
    await pool.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='users' AND column_name='username') THEN
              ALTER TABLE users ADD COLUMN username VARCHAR(100) UNIQUE;
              RAISE NOTICE 'Added username column to users table';
          END IF;
      END $$;
    `);
    console.log('✅ Database schema updated');
    console.log('');

    // Step 2: Clear test data
    console.log('Step 2: Clearing test data...');
    console.log('⚠️  WARNING: This will delete ALL existing data!');
    console.log('');

    // Prompt for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve) => {
      readline.question('Type "YES" to proceed with data cleanup: ', (answer) => {
        readline.close();
        if (answer === 'YES') {
          resolve();
        } else {
          console.log('❌ Setup cancelled');
          process.exit(0);
        }
      });
    });

    await pool.query('TRUNCATE TABLE receipts CASCADE');
    await pool.query('TRUNCATE TABLE agencies CASCADE');
    await pool.query('TRUNCATE TABLE users CASCADE');
    await pool.query('TRUNCATE TABLE audit_logs CASCADE');
    console.log('✅ All test data cleared');
    console.log('');

    // Step 3: Create users
    console.log('Step 3: Creating production users...');
    const saltRounds = 10;

    for (const user of users) {
      const hashedPassword = await bcrypt.hash(user.password, saltRounds);

      await pool.query(
        `INSERT INTO users
         (username, email, name, password_hash, employee_id, station_code, role, phone, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user.username,
          user.email,
          user.name,
          hashedPassword,
          user.employee_id,
          user.station_code,
          user.role,
          user.phone,
          true
        ]
      );
      console.log(`✅ Created: ${user.name} (${user.role})`);
    }

    console.log('');
    console.log('════════════════════════════════════════════════════');
    console.log('✅ PRODUCTION SETUP COMPLETE!');
    console.log('════════════════════════════════════════════════════');
    console.log('');
    console.log('🔑 LOGIN CREDENTIALS (Username/Password)');
    console.log('════════════════════════════════════════════════════');
    console.log('');

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.role.toUpperCase()})`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Password: ${user.password}`);
      console.log('');
    });

    console.log('════════════════════════════════════════════════════');
    console.log('📋 KUSH AIR DETAILS');
    console.log('════════════════════════════════════════════════════');
    console.log('Company: Kush Air');
    console.log('IATA Code: KU');
    console.log('Address: Amin Mohamed Building, Opposite KCB, Juba Town');
    console.log('Email: finance@kushair.net');
    console.log('Phone: +211929754555');
    console.log('');
    console.log('════════════════════════════════════════════════════');
    console.log('⚠️  IMPORTANT SECURITY NOTES:');
    console.log('════════════════════════════════════════════════════');
    console.log('1. All users should change their passwords after first login');
    console.log('2. Keep these credentials secure');
    console.log('3. Authentication now uses USERNAME (not email)');
    console.log('');
    console.log('════════════════════════════════════════════════════');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:', error.message);
    console.error('');
    if (error.message.includes('username')) {
      console.error('Note: The username column might need to be added manually.');
      console.error('Run: psql -d avelio_db -c "ALTER TABLE users ADD COLUMN username VARCHAR(100) UNIQUE;"');
    }
  } finally {
    await pool.end();
    process.exit(0);
  }
}

setupProduction();
