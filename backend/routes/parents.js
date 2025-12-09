import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import pool from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Get all parents
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Optimized query - use JOIN instead of correlated subquery
    let query = `
      SELECT 
        p.*,
        COALESCE(SUM(pmf.outstanding_after_payment), 0) as total_outstanding,
        MAX(CASE WHEN bm.is_active = true THEN pmf.status END) as current_month_status
      FROM parents p
      LEFT JOIN parent_month_fee pmf ON pmf.parent_id = p.id
      LEFT JOIN billing_months bm ON pmf.billing_month_id = bm.id
    `;

    const params = [];
    if (search) {
      query += ` WHERE p.parent_name ILIKE $${params.length + 1} OR p.phone_number ILIKE $${params.length + 1}`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY p.id, p.parent_name, p.phone_number, p.number_of_children, p.monthly_fee_amount, p.created_at, p.updated_at 
               ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    const countQuery = search
      ? 'SELECT COUNT(*) FROM parents WHERE parent_name ILIKE $1 OR phone_number ILIKE $1'
      : 'SELECT COUNT(*) FROM parents';
    const countParams = search ? [`%${search}%`] : [];
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      parents: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get parents error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch parents',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Export all parents to Excel
router.get('/export', authenticateToken, async (req, res) => {
  try {
    // Step 1: Get all parents (simple query first)
    const parentsQuery = await pool.query('SELECT * FROM parents ORDER BY created_at DESC');
    const allParents = parentsQuery.rows || [];

    if (!allParents || allParents.length === 0) {
      return res.status(404).json({ error: 'No parents found to export' });
    }

    // Step 2: Get outstanding amounts for each parent
    const outstandingQuery = await pool.query(`
      SELECT 
        parent_id,
        COALESCE(SUM(outstanding_after_payment), 0) as total_outstanding
      FROM parent_month_fee
      GROUP BY parent_id
    `);
    const outstandingMap = {};
    outstandingQuery.rows.forEach(row => {
      outstandingMap[row.parent_id] = parseFloat(row.total_outstanding || 0);
    });

    // Step 3: Get current month status for each parent
    const statusQuery = await pool.query(`
      SELECT 
        pmf.parent_id,
        pmf.status
      FROM parent_month_fee pmf
      JOIN billing_months bm ON pmf.billing_month_id = bm.id
      WHERE bm.is_active = true
    `);
    const statusMap = {};
    statusQuery.rows.forEach(row => {
      statusMap[row.parent_id] = row.status;
    });

    // Step 4: Prepare data for Excel
    const excelData = allParents.map(parent => ({
      'ID': parent.id || '',
      'Parent Name': parent.parent_name || '',
      'Phone Number': parent.phone_number || '',
      'Number of Children': parent.number_of_children || 0,
      'Monthly Fee': parseFloat(parent.monthly_fee_amount || 0).toFixed(2),
      'Total Outstanding': (outstandingMap[parent.id] || 0).toFixed(2),
      'Current Status': statusMap[parent.id] || 'N/A',
      'Date Added': parent.created_at ? new Date(parent.created_at).toLocaleDateString() : ''
    }));

    // Step 5: Create workbook
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(excelData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 8 },  // ID
      { wch: 25 }, // Parent Name
      { wch: 15 }, // Phone Number
      { wch: 18 }, // Number of Children
      { wch: 15 }, // Monthly Fee
      { wch: 18 }, // Total Outstanding
      { wch: 15 }, // Current Status
      { wch: 15 }  // Date Added
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, 'All Parents');

    // Step 6: Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    if (!buffer || buffer.length === 0) {
      throw new Error('Failed to generate Excel buffer');
    }

    // Step 7: Set headers and send
    const filename = `all_parents_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

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
router.get('/import/template', authenticateToken, (req, res) => {
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
router.post('/import', authenticateToken, upload.single('file'), async (req, res) => {
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
        const parent_name = row['Parent Name'] || row['parent_name'] || row['Name'];
        const phone_number = String(row['Phone Number'] || row['phone_number'] || row['Phone'] || '').trim();
        const number_of_children = parseInt(row['Number of Children'] || row['number_of_children'] || row['Children'] || 1);
        const monthly_fee_amount = parseFloat(row['Monthly Fee'] || row['monthly_fee_amount'] || row['Fee'] || 0);

        if (!parent_name || !phone_number || !monthly_fee_amount) {
          errors.push({ row, error: 'Missing required fields' });
          continue;
        }

        const result = await pool.query(
          `INSERT INTO parents (parent_name, phone_number, number_of_children, monthly_fee_amount)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (phone_number) DO UPDATE
           SET parent_name = EXCLUDED.parent_name,
               number_of_children = EXCLUDED.number_of_children,
               monthly_fee_amount = EXCLUDED.monthly_fee_amount
           RETURNING *`,
          [parent_name, phone_number, number_of_children, monthly_fee_amount]
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
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM parents WHERE id = $1', [id]);

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
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { parent_name, phone_number, number_of_children, monthly_fee_amount } = req.body;

    if (!parent_name || !phone_number || !monthly_fee_amount) {
      return res.status(400).json({ error: 'Parent name, phone number, and monthly fee are required' });
    }

    const result = await pool.query(
      `INSERT INTO parents (parent_name, phone_number, number_of_children, monthly_fee_amount)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [parent_name, phone_number, number_of_children || 1, monthly_fee_amount]
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
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { parent_name, phone_number, number_of_children, monthly_fee_amount } = req.body;

    const result = await pool.query(
      `UPDATE parents 
       SET parent_name = COALESCE($1, parent_name),
           phone_number = COALESCE($2, phone_number),
           number_of_children = COALESCE($3, number_of_children),
           monthly_fee_amount = COALESCE($4, monthly_fee_amount)
       WHERE id = $5 RETURNING *`,
      [parent_name, phone_number, number_of_children, monthly_fee_amount, id]
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
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if parent exists
    const parentResult = await pool.query('SELECT * FROM parents WHERE id = $1', [id]);
    if (parentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    // Delete parent (cascade will handle related records)
    await pool.query('DELETE FROM parents WHERE id = $1', [id]);

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
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;

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
      JOIN billing_months bm ON p.billing_month_id = bm.id
      JOIN users u ON p.collected_by = u.id
      LEFT JOIN payment_items pi ON pi.payment_id = p.id
      WHERE p.parent_id = $1
      ORDER BY p.payment_date DESC
      LIMIT $2`,
      [id, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get parent profile with monthly fee timeline
router.get('/:id/profile', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get parent info
    const parentResult = await pool.query('SELECT * FROM parents WHERE id = $1', [id]);
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
       WHERE (year > $1 OR (year = $1 AND month >= $2))
         AND (year <= $3 OR (year = $3 AND month <= $4))
       ORDER BY year ASC, month ASC`,
      [parentYear, parentMonth, currentYear + 2, 12]
    );

    // Get all parent_month_fee records
    const feeResult = await pool.query(
      `SELECT pmf.*, bm.year, bm.month, bm.is_active
       FROM parent_month_fee pmf
       JOIN billing_months bm ON pmf.billing_month_id = bm.id
       WHERE pmf.parent_id = $1
       ORDER BY bm.year ASC, bm.month ASC`,
      [id]
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
      JOIN billing_months bm ON p.billing_month_id = bm.id
      JOIN users u ON p.collected_by = u.id
      LEFT JOIN payment_items pi ON pi.payment_id = p.id
      WHERE p.parent_id = $1
      ORDER BY p.payment_date ASC`,
      [id]
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
      parent,
      timeline
    });
  } catch (error) {
    console.error('Get parent profile error:', error);
    res.status(500).json({ error: 'Failed to fetch parent profile' });
  }
});

export default router;


