import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function resetDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Starting database reset...');
    await client.query('BEGIN');

    // Delete all data in correct order (respecting foreign key constraints)
    console.log('Deleting payment items...');
    await client.query('DELETE FROM payment_items');
    
    console.log('Deleting advance payments...');
    await client.query('DELETE FROM advance_payments');
    
    console.log('Deleting payments...');
    await client.query('DELETE FROM payments');
    
    console.log('Deleting parent month fees...');
    await client.query('DELETE FROM parent_month_fee');
    
    console.log('Deleting parents...');
    await client.query('DELETE FROM parents');
    
    console.log('Deleting billing months...');
    await client.query('DELETE FROM billing_months');
    
    console.log('Deleting all users...');
    await client.query('DELETE FROM users');

    // Reset sequences
    console.log('Resetting sequences...');
    await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE parents_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE billing_months_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE parent_month_fee_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE payments_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE payment_items_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE advance_payments_id_seq RESTART WITH 1');

    // Create admin user
    console.log('Creating admin user...');
    const username = 'ROWDA';
    const email = 'rowda@rowdatul-iimaan.com';
    const password = 'ROWDA123';
    const role = 'admin';
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await client.query(
      `INSERT INTO users (username, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role`,
      [username, email, passwordHash, role, true]
    );

    await client.query('COMMIT');

    console.log('\n✅ Database reset completed successfully!');
    console.log('\n📋 Admin User Created:');
    console.log('─────────────────────────────────────');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Email: ${email}`);
    console.log(`Role: ${role}`);
    console.log('─────────────────────────────────────');
    console.log('\n⚠️  All other data has been deleted.');
    console.log('⚠️  All sequences have been reset.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Confirmation prompt
console.log('⚠️  WARNING: This will delete ALL data from the database!');
console.log('⚠️  Only the admin user will remain.');
console.log('\nPress Ctrl+C to cancel, or wait 3 seconds to continue...\n');

setTimeout(() => {
  resetDatabase();
}, 3000);

