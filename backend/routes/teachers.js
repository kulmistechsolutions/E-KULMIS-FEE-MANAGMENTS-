import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import pool from '../database/db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

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

// Download import template
router.get('/import/template', authenticateToken, (req, res) => {
  try {
    // Create template data
    const templateData = [
      {
        'Teacher Name': 'Ahmed Ali',
        'Department': 'Quraan',
        'Monthly Salary': 5000.00,
        'Phone Number': '1234567890',
        'Date of Joining': '2024-01-15'
      },
      {
        'Teacher Name': 'Fatima Hassan',
        'Department': 'Primary/Middle/Secondary',
        'Monthly Salary': 6000.00,
        'Phone Number': '0987654321',
        'Date of Joining': '2024-02-01'
      }
    ];

    // Create workbook
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(templateData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Teacher Name
      { wch: 25 }, // Department
      { wch: 15 }, // Monthly Salary
      { wch: 15 }, // Phone Number
      { wch: 18 }  // Date of Joining
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Teachers');

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=teachers_import_template.xlsx');

    res.send(buffer);
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Import teachers from Excel
router.post('/import', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    const imported = [];
    const errors = [];

    for (const row of data) {
      try {
        const teacher_name = row['Teacher Name'] || row['teacher_name'] || row['Name'] || row['name'];
        const department = row['Department'] || row['department'];
        const monthly_salary = parseFloat(row['Monthly Salary'] || row['monthly_salary'] || row['Salary'] || row['salary'] || 0);
        const phone_number = row['Phone Number'] || row['phone_number'] || row['Phone'] || row['phone'] || null;
        const date_of_joining = row['Date of Joining'] || row['date_of_joining'] || row['Date'] || row['date'];

        if (!teacher_name || !department || !monthly_salary || !date_of_joining) {
          errors.push({ row, error: 'Missing required fields (Teacher Name, Department, Monthly Salary, Date of Joining)' });
          continue;
        }

        // Validate department
        const validDepartments = ['Quraan', 'Primary/Middle/Secondary', 'Shareeca'];
        if (!validDepartments.includes(department)) {
          errors.push({ row, error: `Invalid department. Must be one of: ${validDepartments.join(', ')}` });
          continue;
        }

        // Validate date format
        const dateObj = new Date(date_of_joining);
        if (isNaN(dateObj.getTime())) {
          errors.push({ row, error: 'Invalid date format for Date of Joining. Use YYYY-MM-DD format' });
          continue;
        }

        const result = await pool.query(
          `INSERT INTO teachers (teacher_name, department, monthly_salary, phone_number, date_of_joining)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [teacher_name, department, monthly_salary, phone_number || null, date_of_joining]
        );

        imported.push(result.rows[0]);
      } catch (error) {
        errors.push({ row, error: error.message });
      }
    }

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:imported', { count: imported.length });
      io.emit('reports:updated');
    }

    res.json({
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors }
    });
  } catch (error) {
    console.error('Import teachers error:', error);
    res.status(500).json({ error: 'Failed to import teachers' });
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

