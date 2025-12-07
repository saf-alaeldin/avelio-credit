# Database Setup and Restore

## Quick Start - Restore Full Database

To restore the complete database with all current data (383 receipts as of Dec 6, 2025):

```bash
# 1. Create the database
createdb -U mohamedsaeed avelio_db

# 2. Restore the full backup
psql -U mohamedsaeed -d avelio_db < full_backup.sql
```

That's it! Your database will have all the production data.

## Alternative: Fresh Install with Test Data

If you want to start with minimal test data (for development):

```bash
# 1. Create the database
createdb -U mohamedsaeed avelio_db

# 2. Create schema
psql -U mohamedsaeed -d avelio_db < schema.sql

# 3. Load sample data
psql -U mohamedsaeed -d avelio_db < data.sql
```

## Database Files

- `full_backup.sql` - Complete database dump with all current data (156KB, 1030 lines)
- `schema.sql` - Database schema only (tables, indexes, constraints)
- `data.sql` - Minimal sample data for testing (48 receipts from Oct 2025)

## Environment Variables

Make sure your `.env` file has the correct database connection:

```
DB_USER=mohamedsaeed
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=avelio_db
```

## Creating a New Backup

To create a fresh backup of the current database:

```bash
pg_dump -U mohamedsaeed avelio_db > full_backup.sql
```

## Verification

After restore, verify the data:

```bash
psql -U mohamedsaeed -d avelio_db -c "SELECT COUNT(*) FROM receipts;"
psql -U mohamedsaeed -d avelio_db -c "SELECT COUNT(*) FROM agencies;"
psql -U mohamedsaeed -d avelio_db -c "SELECT COUNT(*) FROM users;"
```

Expected counts (as of Dec 6, 2025):
- Receipts: 383
- Agencies: ~40+
- Users: ~10+
