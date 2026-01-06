// run-migration.js - Run a specific migration file
const fs = require('fs');
const path = require('path');
const { pool } = require('./src/config/db');

async function runMigration(migrationFile) {
  const filePath = path.join(__dirname, 'migrations', migrationFile);

  if (!fs.existsSync(filePath)) {
    console.error(`Migration file not found: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`Running migration: ${migrationFile}`);
  console.log('---');

  try {
    const result = await pool.query(sql);
    console.log('Migration completed successfully!');
    if (result.rows && result.rows.length > 0) {
      console.log('Result:', result.rows);
    }
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node run-migration.js <migration-file.sql>');
  process.exit(1);
}

runMigration(migrationFile);
