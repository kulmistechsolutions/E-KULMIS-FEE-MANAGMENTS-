import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../database/db.js';
import { authenticateToken, requireAdmin, requireSchoolContext } from '../middleware/auth.js';

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const result = await pool.query(
      'SELECT id, username, email, role, is_active, created_at FROM users WHERE school_id = $1 ORDER BY created_at DESC',
      [schoolId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user (admin only)
router.post('/', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    const schoolId = req.user.school_id;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, school_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, role, is_active, created_at`,
      [username, email, passwordHash, role || 'cashier', schoolId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, role, is_active } = req.body;
    const schoolId = req.user.school_id;

    let updateFields = [];
    let params = [];
    let paramIndex = 1;

    if (username) {
      updateFields.push(`username = $${paramIndex++}`);
      params.push(username);
    }
    if (email) {
      updateFields.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateFields.push(`password_hash = $${paramIndex++}`);
      params.push(passwordHash);
    }
    if (role) {
      updateFields.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    params.push(schoolId);
    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND school_id = $${paramIndex + 1} RETURNING id, username, email, role, is_active, created_at`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

export default router;


