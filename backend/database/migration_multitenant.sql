-- Migration: Multi-tenant (Schools) + Super Admin + School Branding + Students fields
-- Safe to run multiple times.

-- 1) Schools table
CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    logo_path TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for schools.updated_at (reuse existing function if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    BEGIN
      CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2) Add school_id to all major tables (nullable first for safe backfill)
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE billing_months ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE parent_month_fee ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE payment_items ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE advance_payments ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE teacher_salary_records ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE teacher_salary_payments ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE teacher_advance_payments ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS school_id INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS school_id INTEGER;

-- 3) Student fields (terminology change: keep existing fee logic, add student/guardian/class fields)
ALTER TABLE parents ADD COLUMN IF NOT EXISTS student_name VARCHAR(255);
ALTER TABLE parents ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(255);
ALTER TABLE parents ADD COLUMN IF NOT EXISTS guardian_phone_number VARCHAR(20);
ALTER TABLE parents ADD COLUMN IF NOT EXISTS class_section VARCHAR(100);

-- Backfill student/guardian fields from existing data where possible
UPDATE parents
SET student_name = COALESCE(student_name, parent_name),
    guardian_name = COALESCE(guardian_name, parent_name),
    guardian_phone_number = COALESCE(guardian_phone_number, phone_number)
WHERE (student_name IS NULL OR guardian_name IS NULL OR guardian_phone_number IS NULL);

-- 4) Ensure role set supports super_admin + school_admin (keep existing admin/cashier)
DO $$
BEGIN
  BEGIN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  EXCEPTION
    WHEN undefined_object THEN NULL;
  END;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'school_admin', 'admin', 'cashier'));

-- 5) Create a default school for existing single-tenant data if none exists
DO $$
DECLARE
  default_school_id INTEGER;
BEGIN
  SELECT id INTO default_school_id FROM schools ORDER BY id LIMIT 1;

  IF default_school_id IS NULL THEN
    INSERT INTO schools (name, email, phone)
    VALUES ('Rowdatul Iimaan School', 'admin@rowdatul-iimaan.com', NULL)
    RETURNING id INTO default_school_id;
  END IF;

  -- Backfill school_id on existing data
  UPDATE users SET school_id = default_school_id WHERE school_id IS NULL AND role <> 'super_admin';
  UPDATE parents SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE billing_months SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE parent_month_fee SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE payments SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE payment_items SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE advance_payments SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE teachers SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE teacher_salary_records SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE teacher_salary_payments SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE teacher_advance_payments SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE expense_categories SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE expenses SET school_id = default_school_id WHERE school_id IS NULL;
END $$;

-- 6) Add FK constraints (idempotent via exception handling)
DO $$
BEGIN
  -- Users
  BEGIN
    ALTER TABLE users
      ADD CONSTRAINT users_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Parents (Students)
  BEGIN
    ALTER TABLE parents
      ADD CONSTRAINT parents_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Billing months
  BEGIN
    ALTER TABLE billing_months
      ADD CONSTRAINT billing_months_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Parent month fee
  BEGIN
    ALTER TABLE parent_month_fee
      ADD CONSTRAINT parent_month_fee_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Payments
  BEGIN
    ALTER TABLE payments
      ADD CONSTRAINT payments_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Payment items
  BEGIN
    ALTER TABLE payment_items
      ADD CONSTRAINT payment_items_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Advance payments
  BEGIN
    ALTER TABLE advance_payments
      ADD CONSTRAINT advance_payments_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Teachers
  BEGIN
    ALTER TABLE teachers
      ADD CONSTRAINT teachers_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Teacher salary records
  BEGIN
    ALTER TABLE teacher_salary_records
      ADD CONSTRAINT teacher_salary_records_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Teacher salary payments
  BEGIN
    ALTER TABLE teacher_salary_payments
      ADD CONSTRAINT teacher_salary_payments_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Teacher advance payments
  BEGIN
    ALTER TABLE teacher_advance_payments
      ADD CONSTRAINT teacher_advance_payments_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Expense categories
  BEGIN
    ALTER TABLE expense_categories
      ADD CONSTRAINT expense_categories_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Expenses
  BEGIN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 7) Tighten uniqueness to be per-school (drop old global constraints where they exist)
ALTER TABLE parents DROP CONSTRAINT IF EXISTS parents_phone_number_key;
ALTER TABLE billing_months DROP CONSTRAINT IF EXISTS billing_months_year_month_key;
ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_category_name_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- Recreate uniqueness with school scope
CREATE UNIQUE INDEX IF NOT EXISTS parents_school_phone_uq ON parents (school_id, phone_number);
CREATE UNIQUE INDEX IF NOT EXISTS billing_months_school_year_month_uq ON billing_months (school_id, year, month);
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_school_name_uq ON expense_categories (school_id, category_name);

-- Users: per school uniqueness; allow separate super admin namespace (school_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_school_uq ON users (school_id, username) WHERE school_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_school_uq ON users (school_id, email) WHERE school_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_super_uq ON users (username) WHERE school_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_super_uq ON users (email) WHERE school_id IS NULL;

-- 8) Index school_id columns for performance
CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_parents_school_id ON parents(school_id);
CREATE INDEX IF NOT EXISTS idx_billing_months_school_id ON billing_months(school_id);
CREATE INDEX IF NOT EXISTS idx_parent_month_fee_school_id ON parent_month_fee(school_id);
CREATE INDEX IF NOT EXISTS idx_payments_school_id ON payments(school_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_school_id ON payment_items(school_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_school_id ON advance_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_salary_records_school_id ON teacher_salary_records(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_salary_payments_school_id ON teacher_salary_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_advance_payments_school_id ON teacher_advance_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_school_id ON expense_categories(school_id);
CREATE INDEX IF NOT EXISTS idx_expenses_school_id ON expenses(school_id);

-- 9) Enforce NOT NULL for school data tables (keep users.school_id nullable for super_admin)
ALTER TABLE parents ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE billing_months ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE parent_month_fee ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE payments ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE payment_items ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE advance_payments ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE teachers ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE teacher_salary_records ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE teacher_salary_payments ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE teacher_advance_payments ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE expense_categories ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN school_id SET NOT NULL;




