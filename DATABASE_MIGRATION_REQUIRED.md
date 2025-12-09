# ⚠️ Database Migration Required

## Problem
You're seeing 500 Internal Server Errors because the new database tables for Teacher Salary & Expenses Module don't exist yet.

## Solution: Run Database Migration

### Option 1: Using Migration Script (Recommended)

1. **Make sure your `backend/.env` file has the correct `DATABASE_URL`**

2. **Run the migration script:**
   ```bash
   cd backend
   npm run migrate-teacher-expenses
   ```

   This will create all the new tables:
   - `teachers`
   - `teacher_salary_records`
   - `teacher_salary_payments`
   - `teacher_advance_payments`
   - `expense_categories`
   - `expenses`

### Option 2: Manual SQL Execution

If you prefer to run SQL manually:

1. **Connect to your database** (using psql, pgAdmin, or your database tool)

2. **Run the migration SQL file:**
   ```bash
   psql -d your_database_name -f backend/database/migration_teacher_expenses.sql
   ```

   Or copy the contents of `backend/database/migration_teacher_expenses.sql` and run it in your database console.

### Option 3: Using Neon Database Console

If you're using Neon:

1. Go to your Neon dashboard
2. Open SQL Editor
3. Copy and paste the contents of `backend/database/migration_teacher_expenses.sql`
4. Execute the SQL

## Verify Migration

After running the migration, verify the tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('teachers', 'expense_categories', 'expenses');
```

You should see all three tables listed.

## After Migration

1. **Restart your backend server** (if running locally)
2. **Redeploy backend on Render** (if deployed)
3. **Test the application** - errors should be resolved

## Troubleshooting

### Error: "relation already exists"
- This means the tables already exist. The migration is safe to run multiple times.

### Error: "function update_updated_at_column does not exist"
- This means the base schema wasn't set up. Run the full schema first:
  ```bash
  cd backend
  npm run setup-db
  ```

### Error: "permission denied"
- Make sure your database user has CREATE TABLE permissions.

## Need Help?

If you encounter any issues, check:
1. Database connection string is correct in `backend/.env`
2. Database user has proper permissions
3. All previous migrations have been run

