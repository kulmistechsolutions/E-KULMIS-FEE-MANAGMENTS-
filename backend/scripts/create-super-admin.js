import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function createSuperAdmin() {
  const username = process.argv[2] || 'superadmin';
  const email = process.argv[3] || 'superadmin@fee-kulmis.com';
  const password = process.argv[4] || 'superadmin123';
  const role = 'super_admin';

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, school_id)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (username) DO UPDATE
       SET email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           school_id = NULL
       RETURNING id, username, email, role, school_id`,
      [username, email, passwordHash, role]
    );

    console.log('Super Admin user created/updated successfully:');
    console.log(result.rows[0]);
    console.log(`\nLogin credentials:`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
  } catch (error) {
    console.error('Error creating super admin user:', error);
  } finally {
    await pool.end();
  }
}

createSuperAdmin();




