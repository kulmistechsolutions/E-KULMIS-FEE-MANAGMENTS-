import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { splitSqlStatements } from './sql-utils.js';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse connection string and ensure SSL for Neon/Render
let sslConfig = false;
if (process.env.DATABASE_URL) {
  if (
    process.env.DATABASE_URL.includes('neon.tech') ||
    process.env.DATABASE_URL.includes('onrender.com') ||
    process.env.DATABASE_URL.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production'
  ) {
    sslConfig = { rejectUnauthorized: false };
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
});

async function migrate() {
  try {
    console.log('🔌 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful!\n');

    console.log('📋 Running migration: Multi-tenant + Super Admin + Branding + Students...');
    const migrationPath = join(__dirname, '..', 'database', 'migration_multitenant.sql');
    const migration = readFileSync(migrationPath, 'utf8');

    const statements = splitSqlStatements(migration);

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement);
        } catch (error) {
          // Ignore idempotency-related errors
          const msg = error?.message || '';
          if (
            !msg.includes('already exists') &&
            !msg.includes('duplicate') &&
            !msg.includes('does not exist')
          ) {
            console.warn('Warning:', msg);
          }
        }
      }
    }

    console.log('✅ Migration completed successfully!\n');
    console.log('📝 Changes applied:');
    console.log('   - schools table');
    console.log('   - school_id added to major tables');
    console.log('   - users role expanded to include super_admin');
    console.log('   - student/guardian/class fields added (Parents → Students terminology)\n');
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();


