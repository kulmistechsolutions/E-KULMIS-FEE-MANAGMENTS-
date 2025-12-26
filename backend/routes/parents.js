import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import pool from '../database/db.js';
import { authenticateToken, requireSchoolContext } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Get all students (legacy: parents)
router.get('/', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { search, page = 1, limit = 50, month_id, status } = req.query;
    const offset = (page - 1) * limit;

    // Build query based on filters
    let query;
    const params = [];
    const schoolId = req.user.school_id;
    params.push(schoolId);
    let paramIndex = 2;

    // If filtering by month_id, use a different approach
    if (month_id) {
      query = `
        SELECT DISTINCT
          p.*,
          COALESCE(
            (SELECT SUM(outstanding_after_payment) 
             FROM parent_month_fee 
             WHERE parent_id = p.id AND school_id = $1), 
            0
          ) as total_outstanding,
          pmf.status as current_month_status
        FROM parents p
        INNER JOIN parent_month_fee pmf ON pmf.parent_id = p.id
        WHERE p.school_id = $1
          AND pmf.school_id = $1
          AND pmf.billing_month_id = $${paramIndex}
      `;
      params.push(parseInt(month_id));
      paramIndex++;

      if (search) {
        query += ` AND (
          COALESCE(p.student_name, p.parent_name) ILIKE $${paramIndex}
          OR COALESCE(p.guardian_name, p.parent_name) ILIKE $${paramIndex}
          OR COALESCE(p.guardian_phone_number, p.phone_number) ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (status && status !== 'all') {
        if (status === 'outstanding') {
          query += ` AND pmf.outstanding_after_payment > 0`;
        } else {
          query += ` AND pmf.status = $${paramIndex}`;
          params.push(status);
          paramIndex++;
        }
      }
    } else {
      // Original query without month filter
      query = `
        SELECT 
          p.*,
          COALESCE(SUM(pmf.outstanding_after_payment), 0) as total_outstanding,
          MAX(CASE WHEN bm.is_active = true THEN pmf.status END) as current_month_status
        FROM parents p
        LEFT JOIN parent_month_fee pmf ON pmf.parent_id = p.id AND pmf.school_id = $1
        LEFT JOIN billing_months bm ON pmf.billing_month_id = bm.id AND bm.school_id = $1
      `;

      const conditions = [];
      conditions.push(`p.school_id = $1`);

      if (search) {
        conditions.push(`(
          COALESCE(p.student_name, p.parent_name) ILIKE $${paramIndex}
          OR COALESCE(p.guardian_name, p.parent_name) ILIKE $${paramIndex}
          OR COALESCE(p.guardian_phone_number, p.phone_number) ILIKE $${paramIndex}
        )`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (status && status !== 'all' && status !== 'outstanding') {
        conditions.push(`pmf.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` GROUP BY p.id`;

      if (status === 'outstanding') {
        query += ` HAVING COALESCE(SUM(pmf.outstanding_after_payment), 0) > 0`;
      } else if (status && status !== 'all') {
        query += ` HAVING MAX(CASE WHEN bm.is_active = true THEN pmf.status END) = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count (simplified for now)
    const countQuery = search
      ? `SELECT COUNT(*) FROM parents WHERE school_id = $1 AND (
          COALESCE(student_name, parent_name) ILIKE $2
          OR COALESCE(guardian_name, parent_name) ILIKE $2
          OR COALESCE(guardian_phone_number, phone_number) ILIKE $2
        )`
      : 'SELECT COUNT(*) FROM parents WHERE school_id = $1';
    const countParams = search ? [schoolId, `%${search}%`] : [schoolId];
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      students: result.rows,
      parents: result.rows, // backward compatible
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get students error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    res.status(500).json({ 
      error: 'Failed to fetch students',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Export all parents to Excel
router.get('/export', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { month_id, status, search } = req.query;

    // Build query to get filtered parents
    let parentsQuery;
    const params = [];
    const schoolId = req.user.school_id;
    params.push(schoolId);
    let paramIndex = 2;

    // If filtering by month_id, use a different approach
    if (month_id) {
      parentsQuery = `
        SELECT DISTINCT
          p.*,
          COALESCE(
            (SELECT SUM(outstanding_after_payment) 
             FROM parent_month_fee 
             WHERE parent_id = p.id AND school_id = $1), 
            0
          ) as total_outstanding,
          pmf.status as current_month_status
        FROM parents p
        INNER JOIN parent_month_fee pmf ON pmf.parent_id = p.id
        WHERE p.school_id = $1
          AND pmf.school_id = $1
          AND pmf.billing_month_id = $${paramIndex}
      `;
      params.push(parseInt(month_id));
      paramIndex++;

      if (search) {
        parentsQuery += ` AND (p.parent_name ILIKE $${paramIndex} OR p.phone_number ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (status && status !== 'all') {
        if (status === 'outstanding') {
          parentsQuery += ` AND pmf.outstanding_after_payment > 0`;
        } else {
          parentsQuery += ` AND pmf.status = $${paramIndex}`;
          params.push(status);
          paramIndex++;
        }
      }
    } else {
      // Original query without month filter
      parentsQuery = `
        SELECT DISTINCT
          p.*,
          COALESCE(SUM(pmf.outstanding_after_payment), 0) as total_outstanding,
          MAX(CASE WHEN bm.is_active = true THEN pmf.status END) as current_month_status
        FROM parents p
        LEFT JOIN parent_month_fee pmf ON pmf.parent_id = p.id AND pmf.school_id = $1
        LEFT JOIN billing_months bm ON pmf.billing_month_id = bm.id AND bm.school_id = $1
      `;

      const conditions = [];
      conditions.push(`p.school_id = $1`);

      if (search) {
        conditions.push(`(p.parent_name ILIKE $${paramIndex} OR p.phone_number ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (status && status !== 'all' && status !== 'outstanding') {
        conditions.push(`pmf.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      if (conditions.length > 0) {
        parentsQuery += ` WHERE ${conditions.join(' AND ')}`;
      }

      parentsQuery += ` GROUP BY p.id, p.parent_name, p.phone_number, p.number_of_children, p.monthly_fee_amount, p.created_at, p.updated_at`;

      if (status === 'outstanding') {
        parentsQuery += ` HAVING COALESCE(SUM(pmf.outstanding_after_payment), 0) > 0`;
      } else if (status && status !== 'all') {
        parentsQuery += ` HAVING MAX(CASE WHEN bm.is_active = true THEN pmf.status END) = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    parentsQuery += ` ORDER BY p.created_at DESC`;

    const parentsResult = await pool.query(parentsQuery, params);
    const allParents = parentsResult.rows || [];

    if (!allParents || allParents.length === 0) {
      return res.status(404).json({ error: 'No parents found to export' });
    }

    // Step 2: Get outstanding amounts for each parent
    const outstandingQuery = await pool.query(`
      SELECT 
        parent_id,
        COALESCE(SUM(outstanding_after_payment), 0) as total_outstanding
      FROM parent_month_fee
      WHERE school_id = $1
      GROUP BY parent_id
    `, [schoolId]);
    const outstandingMap = {};
    outstandingQuery.rows.forEach(row => {
      outstandingMap[row.parent_id] = parseFloat(row.total_outstanding || 0);
    });

    // Step 3: Get status for selected month or current month
    let statusQuery;
    if (month_id) {
      statusQuery = await pool.query(`
        SELECT 
          pmf.parent_id,
          pmf.status,
          pmf.outstanding_after_payment
        FROM parent_month_fee pmf
        WHERE pmf.school_id = $1
          AND pmf.billing_month_id = $2
      `, [schoolId, parseInt(month_id)]);
    } else {
      statusQuery = await pool.query(`
        SELECT 
          pmf.parent_id,
          pmf.status,
          pmf.outstanding_after_payment
        FROM parent_month_fee pmf
        JOIN billing_months bm ON pmf.billing_month_id = bm.id
        WHERE pmf.school_id = $1
          AND bm.school_id = $1
          AND bm.is_active = true
      `, [schoolId]);
    }
    const statusMap = {};
    statusQuery.rows.forEach(row => {
      statusMap[row.parent_id] = row.status;
    });

    // Step 4: Prepare data for Excel with proper formatting
    const excelData = allParents.map(parent => ({
      'ID': parent.id || '',
      'Parent Name': parent.parent_name || '',
      'Phone Number': parent.phone_number || '',
      'Number of Children': parent.number_of_children || 0,
      'Monthly Fee': parseFloat(parent.monthly_fee_amount || 0),
      'Total Outstanding': parseFloat(outstandingMap[parent.id] || 0),
      'Status': statusMap[parent.id] || 'N/A',
      'Date Added': parent.created_at ? new Date(parent.created_at).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''
    }));

    // Add summary row
    const totalMonthlyFee = allParents.reduce((sum, p) => sum + parseFloat(p.monthly_fee_amount || 0), 0);
    const totalOutstanding = allParents.reduce((sum, p) => sum + parseFloat(outstandingMap[p.id] || 0), 0);
    excelData.push({
      'ID': '',
      'Parent Name': 'TOTAL',
      'Phone Number': '',
      'Number of Children': allParents.length,
      'Monthly Fee': totalMonthlyFee,
      'Total Outstanding': totalOutstanding,
      'Status': '',
      'Date Added': ''
    });

    // Step 5: Create workbook with proper structure
    const workbook = xlsx.utils.book_new();
    
    // Create worksheet from data
    const worksheet = xlsx.utils.json_to_sheet(excelData);
    
    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 8 },   // ID
      { wch: 30 },  // Parent Name
      { wch: 18 },  // Phone Number
      { wch: 18 },  // Number of Children
      { wch: 15 },  // Monthly Fee
      { wch: 18 },  // Total Outstanding
      { wch: 15 },  // Status
      { wch: 15 }   // Date Added
    ];

    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Parents');

    // Step 6: Generate buffer with proper options
    const buffer = xlsx.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true
    });

    if (!buffer || buffer.length === 0) {
      throw new Error('Failed to generate Excel buffer');
    }

    // Step 7: Set headers and send with proper encoding
    let filename = `Parents_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    if (month_id || (status && status !== 'all')) {
      const statusName = status && status !== 'all' ? status.charAt(0).toUpperCase() + status.slice(1) : '';
      const monthInfo = month_id ? `Month_${month_id}_` : '';
      filename = `Parents_${statusName ? statusName + '_' : ''}${monthInfo}Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    }
    
    // Set proper headers for Excel file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Export parents error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to export parents',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while exporting. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Download import template
router.get('/import/template', authenticateToken, requireSchoolContext, (req, res) => {
  try {
    // Create template data
    const templateData = [
      {
        'Parent Name': 'John Doe',
        'Phone Number': '1234567890',
        'Number of Children': 2,
        'Monthly Fee': 100.00
      },
      {
        'Parent Name': 'Jane Smith',
        'Phone Number': '0987654321',
        'Number of Children': 1,
        'Monthly Fee': 80.00
      }
    ];

    // Create workbook
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(templateData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Parent Name
      { wch: 15 }, // Phone Number
      { wch: 18 }, // Number of Children
      { wch: 15 }  // Monthly Fee
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Parents');

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=parents_import_template.xlsx');

    res.send(buffer);
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Import parents from Excel
router.post('/import', authenticateToken, requireSchoolContext, upload.single('file'), async (req, res) => {
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
    const schoolId = req.user.school_id;

    for (const row of data) {
      try {
        const parent_name = row['Parent Name'] || row['parent_name'] || row['Name'];
        const phone_number = String(row['Phone Number'] || row['phone_number'] || row['Phone'] || '').trim();
        const number_of_children = parseInt(row['Number of Children'] || row['number_of_children'] || row['Children'] || 1);
        const monthly_fee_amount = parseFloat(row['Monthly Fee'] || row['monthly_fee_amount'] || row['Fee'] || 0);

        if (!parent_name || !phone_number || !monthly_fee_amount) {
          errors.push({ row, error: 'Missing required fields' });
          continue;
        }

        const result = await pool.query(
          `INSERT INTO parents (school_id, parent_name, phone_number, number_of_children, monthly_fee_amount)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (school_id, phone_number) DO UPDATE
           SET parent_name = EXCLUDED.parent_name,
               number_of_children = EXCLUDED.number_of_children,
               monthly_fee_amount = EXCLUDED.monthly_fee_amount
           RETURNING *`,
          [schoolId, parent_name, phone_number, number_of_children, monthly_fee_amount]
        );

        imported.push(result.rows[0]);
      } catch (error) {
        errors.push({ row, error: error.message });
      }
    }

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('parent:imported', { count: imported.length });
      io.emit('reports:updated');
    }

    res.json({
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors }
    });
  } catch (error) {
    console.error('Import parents error:', error);
    res.status(500).json({ error: 'Failed to import parents' });
  }
});

// Get single parent
router.get('/:id', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM parents WHERE id = $1 AND school_id = $2', [id, req.user.school_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get parent error:', error);
    res.status(500).json({ error: 'Failed to fetch parent' });
  }
});

// Create parent
router.post('/', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    // Accept both legacy (parent_*) and new Students fields
    const {
      parent_name,
      phone_number,
      number_of_children,
      monthly_fee_amount,
      student_name,
      guardian_name,
      guardian_phone_number,
      class_section
    } = req.body;

    const resolvedStudentName = (student_name || parent_name || '').trim();
    const resolvedGuardianName = (guardian_name || parent_name || '').trim();
    const resolvedGuardianPhone = (guardian_phone_number || phone_number || '').trim();

    if (!resolvedStudentName || !resolvedGuardianName || !resolvedGuardianPhone || !monthly_fee_amount) {
      return res.status(400).json({ error: 'Student name, guardian name, guardian phone, and monthly fee are required' });
    }

    const result = await pool.query(
      `INSERT INTO parents (
        school_id,
        parent_name,
        phone_number,
        number_of_children,
        monthly_fee_amount,
        student_name,
        guardian_name,
        guardian_phone_number,
        class_section
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.user.school_id,
        resolvedGuardianName,
        resolvedGuardianPhone,
        number_of_children || 1,
        monthly_fee_amount,
        resolvedStudentName,
        resolvedGuardianName,
        resolvedGuardianPhone,
        class_section || null
      ]
    );

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('parent:created', { parent: result.rows[0] });
      io.emit('reports:updated');
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Phone number already exists' });
    }
    console.error('Create parent error:', error);
    res.status(500).json({ error: 'Failed to create parent' });
  }
});

// Update parent
router.put('/:id', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      parent_name,
      phone_number,
      number_of_children,
      monthly_fee_amount,
      student_name,
      guardian_name,
      guardian_phone_number,
      class_section
    } = req.body;

    const resolvedStudentName = student_name || null;
    const resolvedGuardianName = guardian_name || parent_name || null;
    const resolvedGuardianPhone = guardian_phone_number || phone_number || null;

    const result = await pool.query(
      `UPDATE parents 
       SET parent_name = COALESCE($1, parent_name),
           phone_number = COALESCE($2, phone_number),
           number_of_children = COALESCE($3, number_of_children),
           monthly_fee_amount = COALESCE($4, monthly_fee_amount),
           student_name = COALESCE($5, student_name),
           guardian_name = COALESCE($6, guardian_name),
           guardian_phone_number = COALESCE($7, guardian_phone_number),
           class_section = COALESCE($8, class_section)
       WHERE id = $9 AND school_id = $10 RETURNING *`,
      [
        resolvedGuardianName,
        resolvedGuardianPhone,
        number_of_children,
        monthly_fee_amount,
        resolvedStudentName,
        resolvedGuardianName,
        resolvedGuardianPhone,
        class_section,
        id,
        req.user.school_id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('parent:updated', { parent_id: id, parent: result.rows[0] });
      io.emit('reports:updated');
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update parent error:', error);
    res.status(500).json({ error: 'Failed to update parent' });
  }
});

// Delete parent
router.delete('/:id', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if parent exists
    const parentResult = await pool.query('SELECT * FROM parents WHERE id = $1 AND school_id = $2', [id, req.user.school_id]);
    if (parentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    // Delete parent (cascade will handle related records)
    await pool.query('DELETE FROM parents WHERE id = $1 AND school_id = $2', [id, req.user.school_id]);

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('parent:deleted', { parent_id: id });
      io.emit('reports:updated');
    }

    res.json({ message: 'Parent deleted successfully' });
  } catch (error) {
    console.error('Delete parent error:', error);
    res.status(500).json({ error: 'Failed to delete parent' });
  }
});

// Get parent fee history
router.get('/:id/history', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;
    const schoolId = req.user.school_id;

    const result = await pool.query(
      `SELECT 
        p.*,
        bm.year,
        bm.month,
        u.username as collected_by_username,
        pi.item_type,
        pi.amount as item_amount,
        pi.months_covered
      FROM payments p
      JOIN billing_months bm ON p.billing_month_id = bm.id AND bm.school_id = $2
      JOIN users u ON p.collected_by = u.id
      LEFT JOIN payment_items pi ON pi.payment_id = p.id
      WHERE p.parent_id = $1 AND p.school_id = $2
      ORDER BY p.payment_date DESC
      LIMIT $3`,
      [id, schoolId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get parent profile with monthly fee timeline
router.get('/:id/profile', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.user.school_id;

    // Get parent info
    const parentResult = await pool.query('SELECT * FROM parents WHERE id = $1 AND school_id = $2', [id, schoolId]);
    if (parentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Parent not found' });
    }
    const parent = parentResult.rows[0];

    // Get all months from parent registration to current (and future if advance exists)
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const parentCreatedDate = new Date(parent.created_at);
    const parentYear = parentCreatedDate.getFullYear();
    const parentMonth = parentCreatedDate.getMonth() + 1;

    // Get all billing months from parent registration to 2 years in future (for advance payments)
    const monthsResult = await pool.query(
      `SELECT * FROM billing_months 
       WHERE school_id = $5
         AND (year > $1 OR (year = $1 AND month >= $2))
         AND (year <= $3 OR (year = $3 AND month <= $4))
       ORDER BY year ASC, month ASC`,
      [parentYear, parentMonth, currentYear + 2, 12, schoolId]
    );

    // Get all parent_month_fee records
    const feeResult = await pool.query(
      `SELECT pmf.*, bm.year, bm.month, bm.is_active
       FROM parent_month_fee pmf
       JOIN billing_months bm ON pmf.billing_month_id = bm.id AND bm.school_id = $2
       WHERE pmf.parent_id = $1 AND pmf.school_id = $2
       ORDER BY bm.year ASC, bm.month ASC`,
      [id, schoolId]
    );

    // Create a map of month fees
    const feeMap = {};
    feeResult.rows.forEach(fee => {
      const key = `${fee.year}-${fee.month}`;
      feeMap[key] = fee;
    });

    // Get all payments with transactions
    const paymentsResult = await pool.query(
      `SELECT 
        p.*,
        bm.year,
        bm.month,
        u.username as collected_by_username,
        pi.item_type,
        pi.amount as item_amount,
        pi.months_covered
      FROM payments p
      JOIN billing_months bm ON p.billing_month_id = bm.id AND bm.school_id = $2
      JOIN users u ON p.collected_by = u.id
      LEFT JOIN payment_items pi ON pi.payment_id = p.id
      WHERE p.parent_id = $1 AND p.school_id = $2
      ORDER BY p.payment_date ASC`,
      [id, schoolId]
    );

    // Group payments by month
    const paymentsByMonth = {};
    paymentsResult.rows.forEach(payment => {
      const key = `${payment.year}-${payment.month}`;
      if (!paymentsByMonth[key]) {
        paymentsByMonth[key] = [];
      }
      paymentsByMonth[key].push(payment);
    });

    // Build timeline
    const timeline = monthsResult.rows.map(billingMonth => {
      const key = `${billingMonth.year}-${billingMonth.month}`;
      const fee = feeMap[key] || null;
      const payments = paymentsByMonth[key] || [];

      // Group payment items by payment_id
      const transactions = [];
      const paymentGroups = {};
      
      payments.forEach(payment => {
        if (!paymentGroups[payment.id]) {
          paymentGroups[payment.id] = {
            id: payment.id,
            amount: payment.amount,
            payment_type: payment.payment_type,
            payment_date: payment.payment_date,
            collected_by_username: payment.collected_by_username,
            notes: payment.notes,
            sms_text: payment.sms_text,
            items: []
          };
        }
        if (payment.item_type) {
          paymentGroups[payment.id].items.push({
            item_type: payment.item_type,
            amount: payment.item_amount,
            months_covered: payment.months_covered
          });
        }
      });

      Object.values(paymentGroups).forEach(payment => {
        transactions.push(payment);
      });

      // Determine if month is overdue
      const isOverdue = fee && 
        fee.status !== 'paid' && 
        fee.status !== 'advanced' &&
        (billingMonth.year < currentYear || 
         (billingMonth.year === currentYear && billingMonth.month < currentMonth));

      return {
        billing_month_id: billingMonth.id,
        year: billingMonth.year,
        month: billingMonth.month,
        month_name: new Date(billingMonth.year, billingMonth.month - 1).toLocaleString('default', { month: 'long' }),
        is_active: billingMonth.is_active,
        monthly_fee: fee ? parseFloat(fee.monthly_fee) : parseFloat(parent.monthly_fee_amount),
        carried_forward_amount: fee ? parseFloat(fee.carried_forward_amount) : 0,
        total_due_this_month: fee ? parseFloat(fee.total_due_this_month) : parseFloat(parent.monthly_fee_amount),
        amount_paid_this_month: fee ? parseFloat(fee.amount_paid_this_month) : 0,
        outstanding_after_payment: fee ? parseFloat(fee.outstanding_after_payment) : (fee ? parseFloat(fee.total_due_this_month) : parseFloat(parent.monthly_fee_amount)),
        status: fee ? fee.status : 'unpaid',
        advance_months_remaining: fee ? fee.advance_months_remaining : 0,
        is_overdue: isOverdue,
        transactions: transactions.sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date))
      };
    });

    res.json({
      student: parent,
      parent, // backward compatible
      timeline
    });
  } catch (error) {
    console.error('Get parent profile error:', error);
    res.status(500).json({ error: 'Failed to fetch parent profile' });
  }
});

export default router;


