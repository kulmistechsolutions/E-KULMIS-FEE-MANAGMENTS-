import jwt from 'jsonwebtoken';
import pool from '../database/db.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists and is active
    const result = await pool.query(
      `SELECT
        u.id, u.username, u.email, u.role, u.is_active, u.school_id,
        s.is_active as school_is_active
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    const user = result.rows[0];

    if (user.role !== 'super_admin') {
      if (!user.school_id) {
        return res.status(403).json({ error: 'School context required' });
      }
      if (user.school_is_active === false) {
        return res.status(403).json({ error: 'School is inactive. Please contact the platform admin.' });
      }
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'school_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin access required' });
  }
  next();
};

// Blocks access to school-scoped modules for users without a school_id (i.e. super_admin)
export const requireSchoolContext = (req, res, next) => {
  if (!req.user?.school_id) {
    return res.status(403).json({ error: 'School context required' });
  }
  next();
};


