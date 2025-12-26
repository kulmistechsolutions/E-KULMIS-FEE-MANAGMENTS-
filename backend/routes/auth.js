import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user by username or email
    const result = await pool.query(
      `SELECT 
        u.*,
        s.name as school_name,
        s.logo_path as school_logo_path,
        s.is_active as school_is_active
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      WHERE (u.username = $1 OR u.email = $1) AND u.is_active = true`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Block school users if school is inactive/deleted
    if (user.role !== 'super_admin') {
      if (!user.school_id) {
        return res.status(403).json({ error: 'School account required' });
      }
      if (user.school_is_active === false) {
        return res.status(403).json({ error: 'School is inactive. Please contact the platform admin.' });
      }
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, schoolId: user.school_id || null },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        school_id: user.school_id || null,
        school: user.school_id
          ? {
              id: user.school_id,
              name: user.school_name,
              logo_path: user.school_logo_path,
            }
          : null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const school = req.user.school_id
      ? await pool.query('SELECT id, name, logo_path FROM schools WHERE id = $1', [req.user.school_id])
      : null;

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        school_id: req.user.school_id || null,
        school: school?.rows?.[0] || null
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;


