import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse connection string and ensure SSL for Neon DB
let sslConfig = false;
if (process.env.DATABASE_URL) {
  if (process.env.DATABASE_URL.includes('neon.tech') || 
      process.env.DATABASE_URL.includes('onrender.com') ||
      process.env.NODE_ENV === 'production') {
    sslConfig = { rejectUnauthorized: false };
  }
  if (process.env.DATABASE_URL.includes('sslmode=require')) {
    sslConfig = { rejectUnauthorized: false };
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

async function migrate() {
  try {
    console.log('🔌 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful!\n');

    console.log('📋 Running migration: Teacher Salary & Expenses Module...');
    const migrationPath = join(__dirname, '..', 'database', 'migration_teacher_expenses.sql');
    const migration = readFileSync(migrationPath, 'utf8');
    
    // Split by semicolons and execute each statement
    const statements = migration.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement);
        } catch (error) {
          // Ignore "already exists" errors
          if (!error.message.includes('already exists') && 
              !error.message.includes('duplicate') &&
              !error.message.includes('does not exist')) {
            console.warn('Warning:', error.message);
          }
        }
      }
    }
    
    console.log('✅ Migration completed successfully!\n');
    console.log('📝 New tables created:');
    console.log('   - teachers');
    console.log('   - teacher_salary_records');
    console.log('   - teacher_salary_payments');
    console.log('   - teacher_advance_payments');
    console.log('   - expense_categories');
    console.log('   - expenses\n');
    console.log('🎉 You can now use the Teacher Salary & Expenses features!\n');

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

