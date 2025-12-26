import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { splitSqlStatements } from './sql-utils.js';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env file!');
    console.log('\n📝 Please create backend/.env file with:');
    console.log('DATABASE_URL=postgresql://user:password@host:5432/database');
    console.log('PORT=5000');
    console.log('JWT_SECRET=your-secret-key-here');
    process.exit(1);
  }

  // Determine SSL config
  let sslConfig = false;
  if (process.env.DATABASE_URL) {
    if (process.env.DATABASE_URL.includes('neon.tech') || 
        process.env.DATABASE_URL.includes('neon.tech') ||
        process.env.DATABASE_URL.includes('sslmode=require') ||
        process.env.NODE_ENV === 'production') {
      sslConfig = { rejectUnauthorized: false };
    }
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig
  });

  try {
    console.log('🔌 Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful!\n');

    // Read and execute schema
    console.log('📋 Setting up database schema...');
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    
    // Split safely (supports $$ blocks, comments, quotes)
    const statements = splitSqlStatements(schema);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement);
        } catch (error) {
          // Ignore "already exists" errors
          if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
            console.warn('Warning:', error.message);
          }
        }
      }
    }
    console.log('✅ Database schema created!\n');

    // Apply multi-tenant migration (creates schools table + school_id columns + student fields)
    try {
      console.log('🏫 Applying multi-tenant migration...');
      const migrationPath = join(__dirname, '..', 'database', 'migration_multitenant.sql');
      const migration = readFileSync(migrationPath, 'utf8');
      const migrationStatements = splitSqlStatements(migration);
      for (const statement of migrationStatements) {
        if (statement.trim()) {
          try {
            await pool.query(statement);
          } catch (error) {
            // Ignore "already exists" / duplicate / benign errors
            if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
              console.warn('Warning:', error.message);
            }
          }
        }
      }
      console.log('✅ Multi-tenant migration applied!\n');
    } catch (e) {
      console.warn('⚠️ Could not apply migration_multitenant.sql automatically.');
      console.warn('   You can run it manually with: npm run migrate-multitenant');
      console.warn('   Error:', e.message);
    }

    // Get default school for assigning first admin (school-scoped)
    let defaultSchoolId = null;
    try {
      const schoolRes = await pool.query('SELECT id FROM schools ORDER BY id LIMIT 1');
      defaultSchoolId = schoolRes.rows[0]?.id || null;
    } catch (_) {
      defaultSchoolId = null;
    }

    // Check if admin user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    
    if (userCheck.rows.length === 0) {
      console.log('👤 Creating admin user...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (username, email, password_hash, role, school_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['admin', 'admin@rowdatul-iimaan.com', passwordHash, 'school_admin', defaultSchoolId]
      );
      console.log('✅ Admin user created!');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   ⚠️  Please change the password after first login!\n');
    } else {
      console.log('ℹ️  Admin user already exists\n');
    }

    // Create a super admin for platform management (optional but helpful for SaaS)
    const superCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['superadmin']);
    if (superCheck.rows.length === 0) {
      console.log('🛡️ Creating super admin user...');
      const superHash = await bcrypt.hash('superadmin123', 10);
      await pool.query(
        `INSERT INTO users (username, email, password_hash, role, school_id)
         VALUES ($1, $2, $3, $4, NULL)`,
        ['superadmin', 'superadmin@fee-kulmis.com', superHash, 'super_admin']
      );
      console.log('✅ Super Admin user created!');
      console.log('   Username: superadmin');
      console.log('   Password: superadmin123\n');
    } else {
      console.log('ℹ️  Super Admin user already exists\n');
    }

    console.log('🎉 Database setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Start backend: cd backend && npm run dev');
    console.log('   2. Start frontend: cd frontend && npm run dev');
    console.log('   3. Open http://localhost:3000');
    console.log('   4. Login with:');
    console.log('      - superadmin / superadmin123 (platform)');
    console.log('      - admin / admin123 (school)\n');

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Make sure your database server is running!');
    } else if (error.code === '28P01') {
      console.error('\n💡 Check your database credentials in .env file!');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();

