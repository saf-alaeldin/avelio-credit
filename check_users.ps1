$env:PGPASSWORD = "postgres123"
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d avelio_db -c "SELECT id, email, role FROM users LIMIT 5;"
