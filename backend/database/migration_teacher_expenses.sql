-- Migration script to add Teacher Salary & Expenses Module tables
-- Run this script on your existing database to add the new tables

-- Teachers table
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    teacher_name VARCHAR(255) NOT NULL,
    department VARCHAR(50) NOT NULL CHECK (department IN ('Quraan', 'Primary/Middle/Secondary', 'Shareeca')),
    monthly_salary DECIMAL(10, 2) NOT NULL,
    phone_number VARCHAR(20),
    date_of_joining DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teacher salary records table (tracks each teacher's salary status per month)
CREATE TABLE IF NOT EXISTS teacher_salary_records (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    billing_month_id INTEGER NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
    monthly_salary DECIMAL(10, 2) NOT NULL,
    advance_balance_used DECIMAL(10, 2) DEFAULT 0,
    total_due_this_month DECIMAL(10, 2) NOT NULL,
    amount_paid_this_month DECIMAL(10, 2) DEFAULT 0,
    outstanding_after_payment DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'partial', 'advance_covered', 'outstanding')),
    advance_months_remaining INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, billing_month_id)
);

-- Teacher salary payments table
CREATE TABLE IF NOT EXISTS teacher_salary_payments (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    billing_month_id INTEGER NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('normal', 'partial', 'advance')),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_by INTEGER NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teacher advance payments tracking
CREATE TABLE IF NOT EXISTS teacher_advance_payments (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    payment_id INTEGER NOT NULL REFERENCES teacher_salary_payments(id) ON DELETE CASCADE,
    months_paid INTEGER NOT NULL,
    months_remaining INTEGER NOT NULL,
    amount_per_month DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expense categories table
CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    amount DECIMAL(10, 2) NOT NULL,
    expense_date DATE NOT NULL,
    billing_month_id INTEGER REFERENCES billing_months(id) ON DELETE SET NULL,
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for teachers and expenses
CREATE INDEX IF NOT EXISTS idx_teachers_department ON teachers(department);
CREATE INDEX IF NOT EXISTS idx_teachers_active ON teachers(is_active);
CREATE INDEX IF NOT EXISTS idx_teacher_salary_records_teacher ON teacher_salary_records(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_salary_records_month ON teacher_salary_records(billing_month_id);
CREATE INDEX IF NOT EXISTS idx_teacher_salary_payments_teacher ON teacher_salary_payments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_salary_payments_month ON teacher_salary_payments(billing_month_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses(billing_month_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

-- Triggers for updated_at
CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teacher_salary_records_updated_at BEFORE UPDATE ON teacher_salary_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teacher_advance_payments_updated_at BEFORE UPDATE ON teacher_advance_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default expense categories (only if they don't exist)
INSERT INTO expense_categories (category_name, description) VALUES
    ('Maintenance', 'Building and facility maintenance costs'),
    ('Books', 'Educational books and materials'),
    ('Electricity', 'Electricity bills'),
    ('Water', 'Water bills'),
    ('Cleaning', 'Cleaning supplies and services'),
    ('Other', 'Other miscellaneous expenses')
ON CONFLICT (category_name) DO NOTHING;

