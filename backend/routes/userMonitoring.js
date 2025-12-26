import express from 'express';
import xlsx from 'xlsx';
import pool from '../database/db.js';
import { authenticateToken, requireAdmin, requireSchoolContext } from '../middleware/auth.js';

const router = express.Router();

// Get daily income per user (admin only)
router.get('/daily-income', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { date, user_id } = req.query;
    const schoolId = req.user.school_id;

    if (!date) {
      return res.status(400).json({ error: 'Date is required (format: YYYY-MM-DD)' });
    }

    let query = `
      SELECT 
        u.id as user_id,
        u.username,
        COUNT(DISTINCT p.id) as transaction_count,
        COALESCE(SUM(p.amount), 0) as total_collected
      FROM users u
      LEFT JOIN payments p ON p.collected_by = u.id
        AND DATE(p.payment_date) = $1
      WHERE u.is_active = true AND u.school_id = $2
    `;

    const params = [date, schoolId];
    if (user_id) {
      query += ` AND u.id = $${params.length + 1}`;
      params.push(parseInt(user_id));
    }

    query += `
      GROUP BY u.id, u.username
      ORDER BY total_collected DESC, u.username
    `;

    const result = await pool.query(query, params);

    res.json({
      date,
      daily_income: result.rows.map(row => ({
        user_id: row.user_id,
        username: row.username,
        transaction_count: parseInt(row.transaction_count),
        total_collected: parseFloat(row.total_collected)
      }))
    });
  } catch (error) {
    console.error('Get daily income error:', error);
    res.status(500).json({ error: 'Failed to fetch daily income' });
  }
});

// Get all transactions by user and date (admin only)
router.get('/transactions', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { date, user_id, start_date, end_date } = req.query;
    const schoolId = req.user.school_id;

    let query = `
      SELECT 
        p.*,
        pr.parent_name,
        pr.phone_number,
        bm.year,
        bm.month,
        u.username as collected_by_username
      FROM payments p
      JOIN parents pr ON p.parent_id = pr.id
      JOIN billing_months bm ON p.billing_month_id = bm.id
      JOIN users u ON p.collected_by = u.id
      WHERE p.school_id = $1 AND pr.school_id = $1 AND bm.school_id = $1 AND u.school_id = $1
    `;

    const params = [schoolId];

    if (date) {
      query += ` AND DATE(p.payment_date) = $${params.length + 1}`;
      params.push(date);
    } else if (start_date && end_date) {
      query += ` AND DATE(p.payment_date) BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(start_date, end_date);
    }

    if (user_id) {
      query += ` AND p.collected_by = $${params.length + 1}`;
      params.push(parseInt(user_id));
    }

    query += ` ORDER BY p.payment_date DESC, p.id DESC`;

    const result = await pool.query(query, params);

    res.json({
      transactions: result.rows,
      total: result.rows.length,
      total_amount: result.rows.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Export daily income report as Excel (admin only)
router.get('/daily-income/export', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { date, user_id } = req.query;
    const schoolId = req.user.school_id;

    if (!date) {
      return res.status(400).json({ error: 'Date is required (format: YYYY-MM-DD)' });
    }

    let query = `
      SELECT 
        u.id as user_id,
        u.username,
        COUNT(DISTINCT p.id) as transaction_count,
        COALESCE(SUM(p.amount), 0) as total_collected
      FROM users u
      LEFT JOIN payments p ON p.collected_by = u.id
        AND DATE(p.payment_date) = $1
      WHERE u.is_active = true AND u.school_id = $2
    `;

    const params = [date, schoolId];
    if (user_id) {
      query += ` AND u.id = $${params.length + 1}`;
      params.push(parseInt(user_id));
    }

    query += `
      GROUP BY u.id, u.username
      ORDER BY total_collected DESC, u.username
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No data found for the selected date' });
    }

    // Prepare Excel data with proper formatting
    const excelData = result.rows.map(row => ({
      'User ID': row.user_id,
      'Username': row.username,
      'Transaction Count': parseInt(row.transaction_count),
      'Total Collected': parseFloat(row.total_collected)
    }));

    // Add summary row
    const totalTransactions = result.rows.reduce((sum, row) => sum + parseInt(row.transaction_count), 0);
    const totalCollected = result.rows.reduce((sum, row) => sum + parseFloat(row.total_collected), 0);
    excelData.push({
      'User ID': '',
      'Username': 'TOTAL',
      'Transaction Count': totalTransactions,
      'Total Collected': totalCollected
    });

    // Create workbook with proper structure
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(excelData);
    
    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 12 },  // User ID
      { wch: 25 },  // Username
      { wch: 20 },  // Transaction Count
      { wch: 18 }   // Total Collected
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Daily Income');

    // Generate buffer with proper options
    const buffer = xlsx.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true
    });

    // Set headers with proper filename and encoding
    const dateFormatted = date.replace(/-/g, '_');
    const userInfo = user_id ? `User_${user_id}_` : '';
    const filename = `Daily_Income_${dateFormatted}_${userInfo}${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Export daily income error:', error);
    res.status(500).json({ error: 'Failed to export daily income' });
  }
});

// Export user complete report (income + transactions) as Excel (admin only)
router.get('/user-complete-export', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { date, user_id } = req.query;
    const schoolId = req.user.school_id;

    if (!date) {
      return res.status(400).json({ error: 'Date is required (format: YYYY-MM-DD)' });
    }

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required for complete export' });
    }

    // Get user info
    const userResult = await pool.query('SELECT id, username, email, role FROM users WHERE id = $1 AND school_id = $2', [parseInt(user_id), schoolId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    // Get daily income summary
    const incomeQuery = `
      SELECT 
        COUNT(DISTINCT p.id) as transaction_count,
        COALESCE(SUM(p.amount), 0) as total_collected
      FROM payments p
      WHERE p.school_id = $3
        AND p.collected_by = $1
        AND DATE(p.payment_date) = $2
    `;
    const incomeResult = await pool.query(incomeQuery, [parseInt(user_id), date, schoolId]);
    const incomeData = incomeResult.rows[0] || { transaction_count: 0, total_collected: 0 };

    // Get all transactions for this user on this date with complete details
    const transactionsQuery = `
      SELECT 
        p.id as payment_id,
        p.amount,
        p.payment_type,
        p.payment_date,
        p.notes,
        p.sms_text,
        pr.id as parent_id,
        pr.parent_name,
        pr.phone_number,
        pr.number_of_children,
        pr.monthly_fee_amount,
        bm.id as billing_month_id,
        bm.year,
        bm.month,
        bm.is_active as month_is_active,
        u.username as collected_by_username,
        pmf.status as payment_status,
        pmf.amount_paid_this_month,
        pmf.outstanding_after_payment
      FROM payments p
      JOIN parents pr ON p.parent_id = pr.id
      JOIN billing_months bm ON p.billing_month_id = bm.id
      JOIN users u ON p.collected_by = u.id
      LEFT JOIN parent_month_fee pmf ON pmf.parent_id = pr.id AND pmf.billing_month_id = bm.id
      WHERE p.school_id = $3 AND pr.school_id = $3 AND bm.school_id = $3 AND u.school_id = $3 AND pmf.school_id = $3
        AND p.collected_by = $1
        AND DATE(p.payment_date) = $2
      ORDER BY p.payment_date DESC, p.id DESC
    `;
    const transactionsResult = await pool.query(transactionsQuery, [parseInt(user_id), date, schoolId]);

    // Create workbook
    const workbook = xlsx.utils.book_new();

    // Sheet 1: User Summary
    const summaryData = [
      { 'Field': 'User ID', 'Value': user.id },
      { 'Field': 'Username', 'Value': user.username },
      { 'Field': 'Email', 'Value': user.email || 'N/A' },
      { 'Field': 'Role', 'Value': user.role },
      { 'Field': 'Date', 'Value': date },
      { 'Field': '', 'Value': '' },
      { 'Field': 'Transaction Count', 'Value': parseInt(incomeData.transaction_count) },
      { 'Field': 'Total Collected', 'Value': parseFloat(incomeData.total_collected) }
    ];
    const summarySheet = xlsx.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [
      { wch: 20 },  // Field
      { wch: 30 }   // Value
    ];
    xlsx.utils.book_append_sheet(workbook, summarySheet, 'User Summary');

    // Sheet 2: Transactions with essential details only
    if (transactionsResult.rows.length > 0) {
      const transactionsData = transactionsResult.rows.map(row => {
        const monthName = new Date(row.year, row.month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
        return {
          'Date & Time': new Date(row.payment_date).toLocaleString('en-US', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          'Parent': row.parent_name,
          'Phone': row.phone_number,
          'Month': monthName,
          'Amount': parseFloat(row.amount),
          'Type': row.payment_type.charAt(0).toUpperCase() + row.payment_type.slice(1)
        };
      });

      // Add summary row
      const totalAmount = transactionsResult.rows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
      transactionsData.push({
        'Date & Time': '',
        'Parent': '',
        'Phone': '',
        'Month': '',
        'Amount': totalAmount,
        'Type': 'TOTAL'
      });

      const transactionsSheet = xlsx.utils.json_to_sheet(transactionsData);
      transactionsSheet['!cols'] = [
        { wch: 20 },  // Date & Time
        { wch: 30 },  // Parent
        { wch: 18 },  // Phone
        { wch: 20 },  // Month
        { wch: 15 },  // Amount
        { wch: 15 }   // Type
      ];
      xlsx.utils.book_append_sheet(workbook, transactionsSheet, 'Transactions');
    } else {
      // Add empty transactions sheet with headers
      const emptyTransactionsData = [{
        'Date & Time': '',
        'Parent': '',
        'Phone': '',
        'Month': '',
        'Amount': '',
        'Type': 'No transactions found for this date'
      }];
      const emptySheet = xlsx.utils.json_to_sheet(emptyTransactionsData);
      xlsx.utils.book_append_sheet(workbook, emptySheet, 'Transactions');
    }

    // Generate buffer
    const buffer = xlsx.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true
    });

    // Set headers
    const dateFormatted = date.replace(/-/g, '_');
    const filename = `User_Report_${user.username}_${dateFormatted}_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Export user complete report error:', error);
    res.status(500).json({ error: 'Failed to export user complete report' });
  }
});

// Export transactions as Excel (admin only)
router.get('/transactions/export', authenticateToken, requireSchoolContext, requireAdmin, async (req, res) => {
  try {
    const { date, user_id, start_date, end_date } = req.query;
    const schoolId = req.user.school_id;

    let query = `
      SELECT 
        p.id,
        p.amount,
        p.payment_type,
        p.payment_date,
        p.notes,
        pr.parent_name,
        pr.phone_number,
        bm.year,
        bm.month,
        u.username as collected_by_username
      FROM payments p
      JOIN parents pr ON p.parent_id = pr.id
      JOIN billing_months bm ON p.billing_month_id = bm.id
      JOIN users u ON p.collected_by = u.id
      WHERE p.school_id = $1 AND pr.school_id = $1 AND bm.school_id = $1 AND u.school_id = $1
    `;

    const params = [schoolId];

    if (date) {
      query += ` AND DATE(p.payment_date) = $${params.length + 1}`;
      params.push(date);
    } else if (start_date && end_date) {
      query += ` AND DATE(p.payment_date) BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(start_date, end_date);
    }

    if (user_id) {
      query += ` AND p.collected_by = $${params.length + 1}`;
      params.push(parseInt(user_id));
    }

    query += ` ORDER BY p.payment_date DESC, p.id DESC`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No transactions found' });
    }

    // Prepare Excel data with essential details only
    // Include "Collected By" column only when exporting all users
    const includeCollectedBy = !user_id;
    
    const excelData = result.rows.map(row => {
      const monthName = new Date(row.year, row.month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const baseData = {
        'Date & Time': new Date(row.payment_date).toLocaleString('en-US', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        'Parent': row.parent_name,
        'Phone': row.phone_number,
        'Month': monthName,
        'Amount': parseFloat(row.amount),
        'Type': row.payment_type.charAt(0).toUpperCase() + row.payment_type.slice(1)
      };
      
      // Add "Collected By" column when exporting all users
      if (includeCollectedBy) {
        baseData['Collected By'] = row.collected_by_username;
      }
      
      return baseData;
    });

    // Add summary row
    const totalAmount = result.rows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
    const summaryRow = {
      'Date & Time': '',
      'Parent': '',
      'Phone': '',
      'Month': '',
      'Amount': totalAmount,
      'Type': 'TOTAL'
    };
    
    if (includeCollectedBy) {
      summaryRow['Collected By'] = '';
    }
    
    excelData.push(summaryRow);

    // Create workbook with proper structure
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(excelData);
    
    // Set column widths for better readability
    const columnWidths = [
      { wch: 20 },  // Date & Time
      { wch: 30 },  // Parent
      { wch: 18 },  // Phone
      { wch: 20 },  // Month
      { wch: 15 },  // Amount
      { wch: 15 }   // Type
    ];
    
    // Add "Collected By" column width when exporting all users
    if (includeCollectedBy) {
      columnWidths.push({ wch: 20 }); // Collected By
    }
    
    worksheet['!cols'] = columnWidths;

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Transactions');

    // Generate buffer with proper options
    const buffer = xlsx.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true
    });

    // Set headers with proper filename and encoding
    let dateInfo = 'All';
    if (date) {
      dateInfo = date.replace(/-/g, '_');
    } else if (start_date && end_date) {
      dateInfo = `${start_date.replace(/-/g, '_')}_to_${end_date.replace(/-/g, '_')}`;
    }
    const userInfo = user_id ? `User_${user_id}_` : '';
    const filename = `Transactions_${dateInfo}_${userInfo}${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Export transactions error:', error);
    res.status(500).json({ error: 'Failed to export transactions' });
  }
});

export default router;

