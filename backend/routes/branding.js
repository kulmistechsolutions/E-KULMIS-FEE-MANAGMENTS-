import express from 'express';
import pool from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Returns system + (optional) school branding for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const systemName = 'FEE-KULMIS';

    if (!req.user.school_id) {
      return res.json({
        system_name: systemName,
        school: null,
      });
    }

    const schoolResult = await pool.query(
      'SELECT id, name, email, phone, logo_path FROM schools WHERE id = $1',
      [req.user.school_id]
    );

    const school = schoolResult.rows[0] || null;

    res.json({
      system_name: systemName,
      school,
    });
  } catch (error) {
    console.error('Get branding error:', error);
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

export default router;




