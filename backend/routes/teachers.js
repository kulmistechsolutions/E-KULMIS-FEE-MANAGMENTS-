import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all teachers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, department, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM teachers WHERE 1=1';
    const params = [];

    if (search) {
      query += ` AND (teacher_name ILIKE $${params.length + 1} OR phone_number ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    if (department && department !== 'all') {
      query += ` AND department = $${params.length + 1}`;
      params.push(department);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM teachers WHERE 1=1';
    const countParams = [];
    if (search) {
      countQuery += ` AND (teacher_name ILIKE $${countParams.length + 1} OR phone_number ILIKE $${countParams.length + 1})`;
      countParams.push(`%${search}%`);
    }
    if (department && department !== 'all') {
      countQuery += ` AND department = $${countParams.length + 1}`;
      countParams.push(department);
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      teachers: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get teachers error:', error);
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

// Get single teacher
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM teachers WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get teacher error:', error);
    res.status(500).json({ error: 'Failed to fetch teacher' });
  }
});

// Create teacher
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teacher_name, department, monthly_salary, phone_number, date_of_joining } = req.body;

    if (!teacher_name || !department || !monthly_salary || !date_of_joining) {
      return res.status(400).json({ error: 'Teacher name, department, monthly salary, and date of joining are required' });
    }

    const result = await pool.query(
      `INSERT INTO teachers (teacher_name, department, monthly_salary, phone_number, date_of_joining)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [teacher_name, department, monthly_salary, phone_number || null, date_of_joining]
    );

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:created', { teacher: result.rows[0] });
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create teacher error:', error);
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

// Update teacher
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { teacher_name, department, monthly_salary, phone_number, date_of_joining, is_active } = req.body;

    const result = await pool.query(
      `UPDATE teachers 
       SET teacher_name = COALESCE($1, teacher_name),
           department = COALESCE($2, department),
           monthly_salary = COALESCE($3, monthly_salary),
           phone_number = COALESCE($4, phone_number),
           date_of_joining = COALESCE($5, date_of_joining),
           is_active = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [teacher_name, department, monthly_salary, phone_number, date_of_joining, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:updated', { teacher_id: id, teacher: result.rows[0] });
      io.emit('reports:updated');
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update teacher error:', error);
    res.status(500).json({ error: 'Failed to update teacher' });
  }
});

// Delete teacher
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if teacher exists
    const teacherResult = await pool.query('SELECT * FROM teachers WHERE id = $1', [id]);
    if (teacherResult.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Delete teacher (cascade will handle related records)
    await pool.query('DELETE FROM teachers WHERE id = $1', [id]);

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:deleted', { teacher_id: id });
      io.emit('reports:updated');
    }

    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('Delete teacher error:', error);
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

// Get teacher salary history
router.get('/:id/salary-history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;

    const result = await pool.query(
      `SELECT 
        tsr.*,
        bm.year,
        bm.month,
        bm.is_active as month_is_active
      FROM teacher_salary_records tsr
      JOIN billing_months bm ON tsr.billing_month_id = bm.id
      WHERE tsr.teacher_id = $1
      ORDER BY bm.year DESC, bm.month DESC
      LIMIT $2`,
      [id, parseInt(limit)]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get teacher salary history error:', error);
    res.status(500).json({ error: 'Failed to fetch salary history' });
  }
});

// Get teacher salary payments
router.get('/:id/payments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;

    const result = await pool.query(
      `SELECT 
        tsp.*,
        bm.year,
        bm.month,
        u.username as paid_by_name
      FROM teacher_salary_payments tsp
      JOIN billing_months bm ON tsp.billing_month_id = bm.id
      JOIN users u ON tsp.paid_by = u.id
      WHERE tsp.teacher_id = $1
      ORDER BY tsp.payment_date DESC
      LIMIT $2`,
      [id, parseInt(limit)]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get teacher payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

export default router;

