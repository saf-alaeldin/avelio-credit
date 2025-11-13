// Script to create deployment users for Avelio Credit system
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
    name: 'Mohamed Saeed',
    email: 'mohamed.saeed@avelio.com',
    password: 'Mohamed@123',
    employee_id: 'ADM-001',
    station_code: 'JUB',
    role: 'admin',
    phone: '+211-XXX-XXX-001'
  },
  {
    name: 'Ahmed Sami',
    email: 'ahmed.sami@avelio.com',
    password: 'Ahmed@123',
    employee_id: 'STF-002',
    station_code: 'JUB',
    role: 'staff',
    phone: '+211-XXX-XXX-002'
  },
  {
    name: 'Sarah Lado',
    email: 'sarah.lado@avelio.com',
    password: 'Sarah@123',
    employee_id: 'STF-003',
    station_code: 'JUB',
    role: 'staff',
    phone: '+211-XXX-XXX-003'
  }
];

async function createUsers() {
  try {
    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('🚀 AVELIO CREDIT - USER DEPLOYMENT');
    console.log('════════════════════════════════════════════════');
    console.log('');

    const saltRounds = 10;
    let created = 0;
    let updated = 0;

    for (const user of users) {
      // Hash the password
      const hashedPassword = await bcrypt.hash(user.password, saltRounds);

      // Check if user exists
      const existing = await pool.query(
        'SELECT id, email FROM users WHERE email = $1',
        [user.email]
      );

      if (existing.rows.length > 0) {
        // Update existing user
        await pool.query(
          `UPDATE users
           SET password_hash = $1,
               name = $2,
               employee_id = $3,
               station_code = $4,
               role = $5,
               phone = $6,
               is_active = true,
               updated_at = CURRENT_TIMESTAMP
           WHERE email = $7`,
          [
            hashedPassword,
            user.name,
            user.employee_id,
            user.station_code,
            user.role,
            user.phone,
            user.email
          ]
        );
        updated++;
        console.log(`✅ Updated: ${user.name} (${user.role})`);
      } else {
        // Create new user
        await pool.query(
          `INSERT INTO users
           (email, name, password_hash, employee_id, station_code, role, phone, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
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
        created++;
        console.log(`✅ Created: ${user.name} (${user.role})`);
      }
    }

    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('════════════════════════════════════════════════');
    console.log(`   Created: ${created} user(s)`);
    console.log(`   Updated: ${updated} user(s)`);
    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('🔑 LOGIN CREDENTIALS');
    console.log('════════════════════════════════════════════════');
    console.log('');

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.role.toUpperCase()})`);
      console.log(`   Email:    ${user.email}`);
      console.log(`   Password: ${user.password}`);
      console.log('');
    });

    console.log('════════════════════════════════════════════════');
    console.log('⚠️  IMPORTANT SECURITY NOTES:');
    console.log('════════════════════════════════════════════════');
    console.log('1. Ask all users to change passwords after first login');
    console.log('2. Keep these credentials secure');
    console.log('3. Share credentials privately with each user');
    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Error creating users:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Make sure the database is running');
    console.error('2. Check your .env file has correct database credentials');
    console.error('3. Verify the users table exists');
    console.error('');
  } finally {
    await pool.end();
    process.exit(0);
  }
}

createUsers();
