import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, requireAdmin, requireSchoolContext } from '../middleware/auth.js';
import xlsx from 'xlsx';

const router = express.Router();

// Get all expense categories
router.get('/categories', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM expense_categories WHERE school_id = $1 ORDER BY category_name',
      [req.user.school_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get expense categories error:', error);
    res.status(500).json({ error: 'Failed to fetch expense categories' });
  }
});

// Create expense category - Admin only
router.post('/categories', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { category_name, description } = req.body;
    const schoolId = req.user.school_id;

    if (!category_name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const result = await pool.query(
      `INSERT INTO expense_categories (school_id, category_name, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [schoolId, category_name, description || null]
    );

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('expense:category:created', { category: result.rows[0] });
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    console.error('Create expense category error:', error);
    res.status(500).json({ error: 'Failed to create expense category' });
  }
});

// Update expense category - Admin only
router.put('/categories/:id', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { category_name, description } = req.body;
    const schoolId = req.user.school_id;

    if (!category_name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const result = await pool.query(
      `UPDATE expense_categories 
       SET category_name = $1, description = $2
       WHERE id = $3 AND school_id = $4 RETURNING *`,
      [category_name, description || null, id, schoolId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('expense:category:updated', { category_id: id, category: result.rows[0] });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    console.error('Update expense category error:', error);
    res.status(500).json({ error: 'Failed to update expense category' });
  }
});

// Delete expense category - Admin only
router.delete('/categories/:id', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.user.school_id;

    // Check if category exists
    const categoryResult = await pool.query('SELECT * FROM expense_categories WHERE id = $1 AND school_id = $2', [id, schoolId]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category is being used by any expenses
    const expensesCheck = await pool.query('SELECT COUNT(*) as count FROM expenses WHERE school_id = $1 AND category_id = $2', [schoolId, id]);
    const expenseCount = parseInt(expensesCheck.rows[0].count);

    if (expenseCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete category. It is being used by ${expenseCount} expense(s). Please remove or reassign those expenses first.` 
      });
    }

    await pool.query('DELETE FROM expense_categories WHERE id = $1 AND school_id = $2', [id, schoolId]);

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('expense:category:deleted', { category_id: id });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete expense category error:', error);
    res.status(500).json({ error: 'Failed to delete expense category' });
  }
});

// Get all expenses
router.get('/', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { month, category_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const schoolId = req.user.school_id;

    let query = `
      SELECT 
        e.*,
        ec.category_name,
        bm.year,
        bm.month,
        u.username as created_by_name
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      JOIN users u ON e.created_by = u.id
      WHERE e.school_id = $1 AND ec.school_id = $1
    `;
    const params = [schoolId];

    if (month) {
      const [year, monthNum] = month.split('-');
      query += ` AND bm.year = $${params.length + 1} AND bm.month = $${params.length + 2}`;
      params.push(year, monthNum);
    }

    if (category_id && category_id !== 'all') {
      query += ` AND e.category_id = $${params.length + 1}`;
      params.push(category_id);
    }

    query += ` ORDER BY e.expense_date DESC, e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      WHERE e.school_id = $1 AND ec.school_id = $1
    `;
    const countParams = [schoolId];
    if (month) {
      const [year, monthNum] = month.split('-');
      countQuery += ` AND bm.year = $${countParams.length + 1} AND bm.month = $${countParams.length + 2}`;
      countParams.push(year, monthNum);
    }
    if (category_id && category_id !== 'all') {
      countQuery += ` AND e.category_id = $${countParams.length + 1}`;
      countParams.push(category_id);
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      expenses: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Get expense summary
router.get('/summary', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM
    const schoolId = req.user.school_id;

    let monthQuery = '';
    const params = [schoolId];

    if (month) {
      const [year, monthNum] = month.split('-');
      monthQuery = 'WHERE e.school_id = $1 AND bm.year = $2 AND bm.month = $3';
      params.push(year, monthNum);
    } else {
      monthQuery = 'WHERE e.school_id = $1 AND bm.is_active = true';
    }

    const summaryQuery = `
      SELECT 
        COALESCE(SUM(e.amount), 0) as total_expenses,
        COUNT(*) as expense_count
      FROM expenses e
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      ${monthQuery}
    `;

    const result = await pool.query(summaryQuery, params);

    // Get expenses by category
    const categoryQuery = `
      SELECT 
        ec.category_name,
        COALESCE(SUM(e.amount), 0) as category_total,
        COUNT(*) as category_count
      FROM expense_categories ec
      LEFT JOIN expenses e ON ec.id = e.category_id
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      WHERE ec.school_id = $1
      ${month ? ' AND bm.year = $2 AND bm.month = $3' : ' AND bm.is_active = true'}
      GROUP BY ec.id, ec.category_name
      ORDER BY category_total DESC
    `;

    const categoryResult = await pool.query(categoryQuery, params);

    res.json({
      summary: result.rows[0],
      by_category: categoryResult.rows
    });
  } catch (error) {
    console.error('Get expense summary error:', error);
    res.status(500).json({ error: 'Failed to fetch expense summary' });
  }
});

// Create expense
router.post('/', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { category_id, amount, expense_date, billing_month_id, notes } = req.body;
    const created_by = req.user.id;
    const schoolId = req.user.school_id;

    if (!category_id || !amount || !expense_date) {
      return res.status(400).json({ error: 'Category, amount, and expense date are required' });
    }

    const result = await pool.query(
      `INSERT INTO expenses (school_id, category_id, amount, expense_date, billing_month_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [schoolId, category_id, amount, expense_date, billing_month_id || null, notes || null, created_by]
    );

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('expense:created', { expense: result.rows[0] });
      io.emit('reports:updated');
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Update expense
router.put('/:id', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { category_id, amount, expense_date, billing_month_id, notes } = req.body;
    const schoolId = req.user.school_id;

    const result = await pool.query(
      `UPDATE expenses 
       SET category_id = COALESCE($1, category_id),
           amount = COALESCE($2, amount),
           expense_date = COALESCE($3, expense_date),
           billing_month_id = COALESCE($4, billing_month_id),
           notes = COALESCE($5, notes)
       WHERE id = $6 AND school_id = $7 RETURNING *`,
      [category_id, amount, expense_date, billing_month_id, notes, id, schoolId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('expense:updated', { expense_id: id, expense: result.rows[0] });
      io.emit('reports:updated');
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// Delete expense
router.delete('/:id', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.user.school_id;

    // Check if expense exists
    const expenseResult = await pool.query('SELECT * FROM expenses WHERE id = $1 AND school_id = $2', [id, schoolId]);
    if (expenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await pool.query('DELETE FROM expenses WHERE id = $1 AND school_id = $2', [id, schoolId]);

    // Emit real-time update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('expense:deleted', { expense_id: id });
      io.emit('reports:updated');
    }

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Export expenses to Excel
router.get('/export', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const { month, category_id } = req.query;
    const schoolId = req.user.school_id;

    let query = `
      SELECT 
        e.id,
        ec.category_name,
        e.amount,
        e.expense_date,
        bm.year,
        bm.month,
        e.notes,
        u.username as created_by_name,
        e.created_at
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      JOIN users u ON e.created_by = u.id
      WHERE e.school_id = $1 AND ec.school_id = $1
    `;
    const params = [schoolId];

    if (month) {
      const [year, monthNum] = month.split('-');
      query += ` AND bm.year = $${params.length + 1} AND bm.month = $${params.length + 2}`;
      params.push(year, monthNum);
    }

    if (category_id && category_id !== 'all') {
      query += ` AND e.category_id = $${params.length + 1}`;
      params.push(category_id);
    }

    query += ` ORDER BY e.expense_date DESC, e.created_at DESC`;

    const result = await pool.query(query, params);
    const expenses = result.rows || [];

    if (expenses.length === 0) {
      return res.status(404).json({ error: 'No expenses found to export' });
    }

    // Prepare data for Excel
    const excelData = expenses.map(expense => ({
      'ID': expense.id || '',
      'Category': expense.category_name || '',
      'Amount': parseFloat(expense.amount || 0).toFixed(2),
      'Date': expense.expense_date ? new Date(expense.expense_date).toLocaleDateString() : '',
      'Month': expense.month && expense.year ? `${expense.month}/${expense.year}` : 'N/A',
      'Notes': expense.notes || '',
      'Created By': expense.created_by_name || '',
      'Created At': expense.created_at ? new Date(expense.created_at).toLocaleDateString() : ''
    }));

    // Create workbook
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(excelData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 8 },  // ID
      { wch: 20 }, // Category
      { wch: 15 }, // Amount
      { wch: 15 }, // Date
      { wch: 12 }, // Month
      { wch: 30 }, // Notes
      { wch: 15 }, // Created By
      { wch: 15 }  // Created At
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Expenses');

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    if (!buffer || buffer.length === 0) {
      throw new Error('Failed to generate Excel buffer');
    }

    // Set headers and send
    const filename = `expenses_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(buffer);
  } catch (error) {
    console.error('Export expenses error:', error);
    res.status(500).json({ 
      error: 'Failed to export expenses',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while exporting.'
    });
  }
});

export default router;

