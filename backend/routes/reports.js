import express from 'express';
import xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import pool from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get summary report
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM

    let monthQuery = '';
    const params = [];

    if (month) {
      const [year, monthNum] = month.split('-');
      monthQuery = 'WHERE bm.year = $1 AND bm.month = $2';
      params.push(year, monthNum);
    } else {
      monthQuery = 'WHERE bm.is_active = true';
    }

    // Get summary statistics
    const summaryResult = await pool.query(
      `SELECT 
        COUNT(*) as total_parents,
        SUM(CASE WHEN pmf.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN pmf.status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_count,
        SUM(CASE WHEN pmf.status = 'partial' THEN 1 ELSE 0 END) as partial_count,
        SUM(CASE WHEN pmf.status = 'advanced' THEN 1 ELSE 0 END) as advanced_count,
        SUM(pmf.amount_paid_this_month) as total_collected,
        SUM(pmf.outstanding_after_payment) as total_outstanding,
        SUM(CASE WHEN pmf.status = 'partial' THEN pmf.outstanding_after_payment ELSE 0 END) as total_partial,
        SUM(pmf.advance_months_remaining * p.monthly_fee_amount) as total_advance_value
      FROM parent_month_fee pmf
      JOIN billing_months bm ON pmf.billing_month_id = bm.id
      JOIN parents p ON pmf.parent_id = p.id
      ${monthQuery}`,
      params
    );

    // Get monthly collection trend (last 12 months)
    const trendResult = await pool.query(
      `SELECT 
        bm.year,
        bm.month,
        SUM(pmf.amount_paid_this_month) as collected
      FROM parent_month_fee pmf
      JOIN billing_months bm ON pmf.billing_month_id = bm.id
      GROUP BY bm.year, bm.month
      ORDER BY bm.year DESC, bm.month DESC
      LIMIT 12`
    );

    // Get status distribution
    const distributionResult = await pool.query(
      `SELECT 
        pmf.status,
        COUNT(*) as count
      FROM parent_month_fee pmf
      JOIN billing_months bm ON pmf.billing_month_id = bm.id
      ${monthQuery}
      GROUP BY pmf.status`,
      params
    );

    // Get teacher salary summary
    const teacherSalarySummary = await pool.query(`
      SELECT 
        COALESCE(SUM(tsr.total_due_this_month), 0) as total_salary_required,
        COALESCE(SUM(tsr.amount_paid_this_month), 0) as total_salary_paid,
        COALESCE(SUM(tsr.outstanding_after_payment), 0) as total_salary_outstanding
      FROM teacher_salary_records tsr
      JOIN billing_months bm ON tsr.billing_month_id = bm.id
      ${monthQuery}`,
      params
    );

    // Get expenses summary
    const expensesSummary = await pool.query(`
      SELECT 
        COALESCE(SUM(e.amount), 0) as total_expenses
      FROM expenses e
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      ${monthQuery}`,
      params
    );

    const parentSummary = summaryResult.rows[0];
    const salarySummary = teacherSalarySummary.rows[0];
    const expenseSummary = expensesSummary.rows[0];

    // Calculate net balance
    const totalIncome = parseFloat(parentSummary.total_collected || 0);
    const totalSalaryPaid = parseFloat(salarySummary.total_salary_paid || 0);
    const totalExpenses = parseFloat(expenseSummary.total_expenses || 0);
    const netBalance = totalIncome - totalSalaryPaid - totalExpenses;

    res.json({
      summary: {
        ...parentSummary,
        total_salary_required: salarySummary.total_salary_required,
        total_salary_paid: salarySummary.total_salary_paid,
        total_salary_outstanding: salarySummary.total_salary_outstanding,
        total_expenses: expenseSummary.total_expenses,
        net_balance: netBalance
      },
      trend: trendResult.rows.reverse(),
      distribution: distributionResult.rows
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Helper function to build month query
function buildMonthQuery(month) {
  if (month) {
    const [year, monthNum] = month.split('-');
    if (!year || !monthNum) {
      return { query: '', params: [], error: 'Invalid month format' };
    }
    return {
      query: 'WHERE bm.year = $1 AND bm.month = $2',
      params: [parseInt(year), parseInt(monthNum)]
    };
  }
  return {
    query: 'WHERE bm.is_active = true',
    params: []
  };
}

// Export Parents Only - Excel (specific routes must come before generic)
router.get('/export-parents-excel', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query;
    const { query: monthQuery, params } = buildMonthQuery(month);

    const parentQuery = `
      SELECT 
        p.parent_name as "Parent Name",
        p.phone_number as "Phone",
        p.number_of_children as "Children",
        p.monthly_fee_amount as "Monthly Fee",
        pmf.amount_paid_this_month as "Paid Amount",
        pmf.outstanding_after_payment as "Outstanding",
        pmf.status as "Status",
        bm.year as "Year",
        bm.month as "Month"
      FROM parent_month_fee pmf
      JOIN parents p ON pmf.parent_id = p.id
      JOIN billing_months bm ON pmf.billing_month_id = bm.id
      ${monthQuery}
      ORDER BY p.parent_name
    `;

    const result = await pool.query(parentQuery, params);
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(result.rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Parents');
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=parents-report-${month || 'active'}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export parents Excel error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export parents Excel',
      message: error.message
    });
  }
});

// Export Teachers Only - Excel
router.get('/export-teachers-excel', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query;
    const { query: monthQuery, params } = buildMonthQuery(month);

    const teacherQuery = `
      SELECT 
        t.full_name as "Teacher Name",
        t.department as "Department",
        t.monthly_salary_amount as "Monthly Salary",
        tsr.total_due_this_month as "Total Due",
        tsr.amount_paid_this_month as "Amount Paid",
        tsr.outstanding_after_payment as "Outstanding",
        tsr.status as "Status",
        bm.year as "Year",
        bm.month as "Month"
      FROM teacher_salary_records tsr
      JOIN teachers t ON tsr.teacher_id = t.id
      JOIN billing_months bm ON tsr.billing_month_id = bm.id
      ${monthQuery}
      ORDER BY t.full_name
    `;

    const result = await pool.query(teacherQuery, params);
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(result.rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Teachers');
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=teachers-report-${month || 'active'}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export teachers Excel error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export teachers Excel',
      message: error.message
    });
  }
});

// Export Expenses Only - Excel
router.get('/export-expenses-excel', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query;
    let expensesQuery = `
      SELECT 
        e.expense_date as "Date",
        ec.category_name as "Category",
        e.amount as "Amount",
        e.notes as "Notes/Description",
        bm.year as "Year",
        bm.month as "Month"
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
    `;
    const expenseParams = [];
    if (month) {
      const [year, monthNum] = month.split('-');
      expensesQuery += ' WHERE (bm.year = $1 AND bm.month = $2) OR (bm.id IS NULL AND EXTRACT(YEAR FROM e.expense_date) = $1 AND EXTRACT(MONTH FROM e.expense_date) = $2)';
      expenseParams.push(parseInt(year), parseInt(monthNum));
    } else {
      expensesQuery += ' WHERE bm.is_active = true OR bm.id IS NULL';
    }
    expensesQuery += ' ORDER BY e.expense_date DESC';

    const result = await pool.query(expensesQuery, month ? expenseParams : []);
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(result.rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Expenses');
    
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=expenses-report-${month || 'active'}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export expenses Excel error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export expenses Excel',
      message: error.message
    });
  }
});

// Export Parents Only - PDF
router.get('/export-parents-pdf', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query;
    const { query: monthQuery, params } = buildMonthQuery(month);

    const parentQuery = `
      SELECT 
        p.parent_name,
        p.phone_number,
        p.monthly_fee_amount,
        pmf.amount_paid_this_month,
        pmf.outstanding_after_payment,
        pmf.status
      FROM parent_month_fee pmf
      JOIN parents p ON pmf.parent_id = p.id
      JOIN billing_months bm ON pmf.billing_month_id = bm.id
      ${monthQuery}
      ORDER BY p.parent_name
    `;

    const result = await pool.query(parentQuery, params);
    
    let monthInfo = 'Current Active Month';
    if (month) {
      const [year, monthNum] = month.split('-');
      monthInfo = new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=parents-report-${month || 'active'}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('Rowdatul Iimaan School', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').text('Parents Fee Report', { align: 'center' });
    doc.fontSize(12).text(`Period: ${monthInfo}`, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    if (result.rows.length > 0) {
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Parent Name', 50, doc.y, { width: 120 });
      doc.text('Phone', 170, doc.y, { width: 90 });
      doc.text('Fee', 260, doc.y, { width: 70 });
      doc.text('Paid', 330, doc.y, { width: 70 });
      doc.text('Outstanding', 400, doc.y, { width: 80 });
      doc.text('Status', 480, doc.y, { width: 65 });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(9);

      result.rows.forEach((row) => {
        if (doc.y > 750) {
          doc.addPage();
          doc.fontSize(10).font('Helvetica-Bold');
          doc.text('Parent Name', 50, 50, { width: 120 });
          doc.text('Phone', 170, 50, { width: 90 });
          doc.text('Fee', 260, 50, { width: 70 });
          doc.text('Paid', 330, 50, { width: 70 });
          doc.text('Outstanding', 400, 50, { width: 80 });
          doc.text('Status', 480, 50, { width: 65 });
          doc.moveDown(0.5);
          doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
          doc.moveDown(0.3);
          doc.font('Helvetica').fontSize(9);
        }
        doc.text(row.parent_name || '-', 50, doc.y, { width: 120 });
        doc.text(row.phone_number || '-', 170, doc.y, { width: 90 });
        doc.text(`$${parseFloat(row.monthly_fee_amount || 0).toFixed(2)}`, 260, doc.y, { width: 70 });
        doc.text(`$${parseFloat(row.amount_paid_this_month || 0).toFixed(2)}`, 330, doc.y, { width: 70 });
        doc.text(`$${parseFloat(row.outstanding_after_payment || 0).toFixed(2)}`, 400, doc.y, { width: 80 });
        doc.text(row.status || '-', 480, doc.y, { width: 65 });
        doc.moveDown(0.4);
      });
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.end();
  } catch (error) {
    console.error('Export parents PDF error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export parents PDF',
      message: error.message
    });
  }
});

// Export Teachers Only - PDF
router.get('/export-teachers-pdf', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query;
    const { query: monthQuery, params } = buildMonthQuery(month);

    const teacherQuery = `
      SELECT 
        t.full_name,
        t.department,
        t.monthly_salary_amount,
        tsr.total_due_this_month,
        tsr.amount_paid_this_month,
        tsr.outstanding_after_payment,
        tsr.status
      FROM teacher_salary_records tsr
      JOIN teachers t ON tsr.teacher_id = t.id
      JOIN billing_months bm ON tsr.billing_month_id = bm.id
      ${monthQuery}
      ORDER BY t.full_name
    `;

    const result = await pool.query(teacherQuery, params);
    
    let monthInfo = 'Current Active Month';
    if (month) {
      const [year, monthNum] = month.split('-');
      monthInfo = new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=teachers-report-${month || 'active'}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('Rowdatul Iimaan School', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').text('Teachers Salary Report', { align: 'center' });
    doc.fontSize(12).text(`Period: ${monthInfo}`, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    if (result.rows.length > 0) {
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Teacher Name', 50, doc.y, { width: 130 });
      doc.text('Department', 180, doc.y, { width: 100 });
      doc.text('Salary', 280, doc.y, { width: 70 });
      doc.text('Paid', 350, doc.y, { width: 70 });
      doc.text('Outstanding', 420, doc.y, { width: 85 });
      doc.text('Status', 505, doc.y, { width: 40 });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(9);

      result.rows.forEach((row) => {
        if (doc.y > 750) {
          doc.addPage();
          doc.fontSize(10).font('Helvetica-Bold');
          doc.text('Teacher Name', 50, 50, { width: 130 });
          doc.text('Department', 180, 50, { width: 100 });
          doc.text('Salary', 280, 50, { width: 70 });
          doc.text('Paid', 350, 50, { width: 70 });
          doc.text('Outstanding', 420, 50, { width: 85 });
          doc.text('Status', 505, 50, { width: 40 });
          doc.moveDown(0.5);
          doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
          doc.moveDown(0.3);
          doc.font('Helvetica').fontSize(9);
        }
        doc.text(row.full_name || '-', 50, doc.y, { width: 130 });
        doc.text(row.department || '-', 180, doc.y, { width: 100 });
        doc.text(`$${parseFloat(row.monthly_salary_amount || 0).toFixed(2)}`, 280, doc.y, { width: 70 });
        doc.text(`$${parseFloat(row.amount_paid_this_month || 0).toFixed(2)}`, 350, doc.y, { width: 70 });
        doc.text(`$${parseFloat(row.outstanding_after_payment || 0).toFixed(2)}`, 420, doc.y, { width: 85 });
        doc.text(row.status || '-', 505, doc.y, { width: 40 });
        doc.moveDown(0.4);
      });
    } else {
      doc.fontSize(12).font('Helvetica').text('No teacher salary records found for this period.', 50, doc.y);
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.end();
  } catch (error) {
    console.error('Export teachers PDF error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export teachers PDF',
      message: error.message
    });
  }
});

// Export Expenses Only - PDF
router.get('/export-expenses-pdf', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query;
    let expensesQuery = `
      SELECT 
        e.expense_date,
        ec.category_name,
        e.amount,
        e.notes
      FROM expenses e
      JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
    `;
    const expenseParams = [];
    if (month) {
      const [year, monthNum] = month.split('-');
      expensesQuery += ' WHERE (bm.year = $1 AND bm.month = $2) OR (bm.id IS NULL AND EXTRACT(YEAR FROM e.expense_date) = $1 AND EXTRACT(MONTH FROM e.expense_date) = $2)';
      expenseParams.push(parseInt(year), parseInt(monthNum));
    } else {
      expensesQuery += ' WHERE bm.is_active = true OR bm.id IS NULL';
    }
    expensesQuery += ' ORDER BY e.expense_date DESC';

    const result = await pool.query(expensesQuery, month ? expenseParams : []);
    
    let monthInfo = 'Current Active Month';
    if (month) {
      const [year, monthNum] = month.split('-');
      monthInfo = new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=expenses-report-${month || 'active'}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('Rowdatul Iimaan School', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').text('Expenses Report', { align: 'center' });
    doc.fontSize(12).text(`Period: ${monthInfo}`, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    if (result.rows.length > 0) {
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Date', 50, doc.y, { width: 90 });
      doc.text('Category', 140, doc.y, { width: 120 });
      doc.text('Amount', 260, doc.y, { width: 80 });
      doc.text('Description', 340, doc.y, { width: 205 });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(9);

      result.rows.forEach((row) => {
        if (doc.y > 750) {
          doc.addPage();
          doc.fontSize(10).font('Helvetica-Bold');
          doc.text('Date', 50, 50, { width: 90 });
          doc.text('Category', 140, 50, { width: 120 });
          doc.text('Amount', 260, 50, { width: 80 });
          doc.text('Description', 340, 50, { width: 205 });
          doc.moveDown(0.5);
          doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
          doc.moveDown(0.3);
          doc.font('Helvetica').fontSize(9);
        }
        const expenseDate = row.expense_date ? new Date(row.expense_date).toLocaleDateString() : '-';
        doc.text(expenseDate, 50, doc.y, { width: 90 });
        doc.text(row.category_name || '-', 140, doc.y, { width: 120 });
        doc.text(`$${parseFloat(row.amount || 0).toFixed(2)}`, 260, doc.y, { width: 80 });
        doc.text(row.notes || '-', 340, doc.y, { width: 205 });
        doc.moveDown(0.4);
      });
    } else {
      doc.fontSize(12).font('Helvetica').text('No expenses found for this period.', 50, doc.y);
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.end();
  } catch (error) {
    console.error('Export expenses PDF error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export expenses PDF',
      message: error.message
    });
  }
});

// Export to Excel (All Reports - generic route comes after specific ones)
router.get('/export-excel', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM

    let monthQuery = '';
    const params = [];

    if (month) {
      const [year, monthNum] = month.split('-');
      if (!year || !monthNum) {
        return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
      }
      monthQuery = 'WHERE bm.year = $1 AND bm.month = $2';
      params.push(parseInt(year), parseInt(monthNum));
    } else {
      monthQuery = 'WHERE bm.is_active = true';
    }

    // 1. Parent Fee Records - Handle empty results gracefully
    let parentResult = { rows: [] };
    try {
      const parentQuery = `
        SELECT 
          p.parent_name as "Parent Name",
          p.phone_number as "Phone",
          p.number_of_children as "Children",
          p.monthly_fee_amount as "Monthly Fee",
          pmf.amount_paid_this_month as "Paid Amount",
          pmf.outstanding_after_payment as "Outstanding",
          pmf.status as "Status",
          bm.year as "Year",
          bm.month as "Month"
        FROM parent_month_fee pmf
        JOIN parents p ON pmf.parent_id = p.id
        JOIN billing_months bm ON pmf.billing_month_id = bm.id
        ${monthQuery}
        ORDER BY p.parent_name
      `;
      parentResult = await pool.query(parentQuery, params);
    } catch (err) {
      console.error('Error fetching parent records:', err);
      // Continue with empty array
    }

    // 2. Teacher Salary Records - Handle empty results gracefully
    let teacherSalaryResult = { rows: [] };
    try {
      const teacherSalaryQuery = `
        SELECT 
          t.full_name as "Teacher Name",
          t.department as "Department",
          t.monthly_salary_amount as "Monthly Salary",
          tsr.total_due_this_month as "Total Due",
          tsr.amount_paid_this_month as "Amount Paid",
          tsr.outstanding_after_payment as "Outstanding",
          tsr.status as "Status",
          bm.year as "Year",
          bm.month as "Month"
        FROM teacher_salary_records tsr
        JOIN teachers t ON tsr.teacher_id = t.id
        JOIN billing_months bm ON tsr.billing_month_id = bm.id
        ${monthQuery}
        ORDER BY t.full_name
      `;
      teacherSalaryResult = await pool.query(teacherSalaryQuery, params);
    } catch (err) {
      console.error('Error fetching teacher salary records:', err);
      // Continue with empty array
    }

    // 3. Expenses List - Handle empty results gracefully
    let expensesResult = { rows: [] };
    try {
      let expensesQuery = `
        SELECT 
          e.expense_date as "Date",
          ec.category_name as "Category",
          e.amount as "Amount",
          e.notes as "Notes/Description",
          bm.year as "Year",
          bm.month as "Month"
        FROM expenses e
        JOIN expense_categories ec ON e.category_id = ec.id
        LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      `;

      const expenseParams = [];
      if (month) {
        const [year, monthNum] = month.split('-');
        expensesQuery += ' WHERE (bm.year = $1 AND bm.month = $2) OR (bm.id IS NULL AND EXTRACT(YEAR FROM e.expense_date) = $1 AND EXTRACT(MONTH FROM e.expense_date) = $2)';
        expenseParams.push(parseInt(year), parseInt(monthNum));
      } else {
        expensesQuery += ' WHERE bm.is_active = true OR bm.id IS NULL';
      }

      expensesQuery += ' ORDER BY e.expense_date DESC';

      expensesResult = await pool.query(expensesQuery, month ? expenseParams : []);
    } catch (err) {
      console.error('Error fetching expenses:', err);
      // Continue with empty array
    }

    // 4. Summary Sheet - Get expenses separately to avoid complex subquery
    let totalExpenses = 0;
    try {
      let expensesSummaryQuery = `
        SELECT COALESCE(SUM(e.amount), 0) as total_expenses
        FROM expenses e
        LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      `;
      const expensesSummaryParams = [];
      if (month) {
        const [year, monthNum] = month.split('-');
        expensesSummaryQuery += ' WHERE (bm.year = $1 AND bm.month = $2) OR (bm.id IS NULL AND EXTRACT(YEAR FROM e.expense_date) = $1 AND EXTRACT(MONTH FROM e.expense_date) = $2)';
        expensesSummaryParams.push(parseInt(year), parseInt(monthNum));
      } else {
        expensesSummaryQuery += ' WHERE bm.is_active = true OR bm.id IS NULL';
      }
      const expensesSummaryResult = await pool.query(expensesSummaryQuery, expensesSummaryParams);
      totalExpenses = parseFloat(expensesSummaryResult.rows[0]?.total_expenses || 0);
    } catch (err) {
      console.error('Error fetching expenses summary:', err);
      totalExpenses = 0;
    }

    // Get summary data - Handle empty results
    let summaryRow = {
      'Total Parents': 0,
      'Total Teachers': 0,
      'Total Fees Collected': 0,
      'Total Outstanding Fees': 0,
      'Total Salary Required': 0,
      'Total Salary Paid': 0,
      'Total Salary Outstanding': 0,
      'Total Expenses': totalExpenses,
      'Net Balance': 0
    };

    try {
      const summaryData = await pool.query(
        `SELECT 
          COALESCE(COUNT(DISTINCT p.id), 0) as "Total Parents",
          COALESCE(COUNT(DISTINCT t.id), 0) as "Total Teachers",
          COALESCE(SUM(pmf.amount_paid_this_month), 0) as "Total Fees Collected",
          COALESCE(SUM(pmf.outstanding_after_payment), 0) as "Total Outstanding Fees",
          COALESCE(SUM(tsr.total_due_this_month), 0) as "Total Salary Required",
          COALESCE(SUM(tsr.amount_paid_this_month), 0) as "Total Salary Paid",
          COALESCE(SUM(tsr.outstanding_after_payment), 0) as "Total Salary Outstanding"
        FROM parent_month_fee pmf
        JOIN billing_months bm ON pmf.billing_month_id = bm.id
        JOIN parents p ON pmf.parent_id = p.id
        LEFT JOIN teacher_salary_records tsr ON tsr.billing_month_id = bm.id
        LEFT JOIN teachers t ON tsr.teacher_id = t.id
        ${monthQuery}`,
        params
      );

      if (summaryData.rows.length > 0) {
        summaryRow = summaryData.rows[0];
      }
    } catch (err) {
      console.error('Error fetching summary data:', err);
      // Use default values
    }

    // Calculate net balance
    const totalFeesCollected = parseFloat(summaryRow['Total Fees Collected'] || 0);
    const totalSalaryPaid = parseFloat(summaryRow['Total Salary Paid'] || 0);
    const netBalance = totalFeesCollected - totalSalaryPaid - totalExpenses;

    // Add expenses and net balance to summary
    summaryRow['Total Expenses'] = totalExpenses;
    summaryRow['Net Balance'] = netBalance;

    // Create workbook with multiple sheets
    const workbook = xlsx.utils.book_new();
    
    // Summary sheet - convert single row object to array format
    const summaryArray = [summaryRow];
    const summarySheet = xlsx.utils.json_to_sheet(summaryArray);
    xlsx.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Parent Fee Records sheet
    if (parentResult.rows.length > 0) {
      const parentSheet = xlsx.utils.json_to_sheet(parentResult.rows);
      xlsx.utils.book_append_sheet(workbook, parentSheet, 'Parent Fees');
    }
    
    // Teacher Salary Records sheet
    if (teacherSalaryResult.rows.length > 0) {
      const teacherSheet = xlsx.utils.json_to_sheet(teacherSalaryResult.rows);
      xlsx.utils.book_append_sheet(workbook, teacherSheet, 'Teacher Salaries');
    }
    
    // Expenses sheet
    if (expensesResult.rows.length > 0) {
      const expensesSheet = xlsx.utils.json_to_sheet(expensesResult.rows);
      xlsx.utils.book_append_sheet(workbook, expensesSheet, 'Expenses');
    }

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=complete-report-${month || 'active'}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export Excel error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export Excel',
      message: error.message || 'An error occurred while exporting. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Export financial report to PDF
router.get('/export-pdf', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM

    let monthQuery = '';
    const params = [];

    if (month) {
      const [year, monthNum] = month.split('-');
      monthQuery = 'WHERE bm.year = $1 AND bm.month = $2';
      params.push(year, monthNum);
    } else {
      monthQuery = 'WHERE bm.is_active = true';
    }

    // Get all summary data
    const parentSummary = await pool.query(
      `SELECT 
        COUNT(*) as total_parents,
        SUM(CASE WHEN pmf.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN pmf.status = 'unpaid' THEN 1 ELSE 0 END) as unpaid_count,
        SUM(CASE WHEN pmf.status = 'partial' THEN 1 ELSE 0 END) as partial_count,
        SUM(CASE WHEN pmf.status = 'advanced' THEN 1 ELSE 0 END) as advanced_count,
        SUM(pmf.amount_paid_this_month) as total_collected,
        SUM(pmf.outstanding_after_payment) as total_outstanding,
        SUM(pmf.advance_months_remaining * p.monthly_fee_amount) as total_advance_value
      FROM parent_month_fee pmf
      JOIN billing_months bm ON pmf.billing_month_id = bm.id
      JOIN parents p ON pmf.parent_id = p.id
      ${monthQuery}`,
      params
    );

    const teacherSalarySummary = await pool.query(`
      SELECT 
        COALESCE(SUM(tsr.total_due_this_month), 0) as total_salary_required,
        COALESCE(SUM(tsr.amount_paid_this_month), 0) as total_salary_paid,
        COALESCE(SUM(tsr.outstanding_after_payment), 0) as total_salary_outstanding
      FROM teacher_salary_records tsr
      JOIN billing_months bm ON tsr.billing_month_id = bm.id
      ${monthQuery}`,
      params
    );

    const expensesSummary = await pool.query(`
      SELECT 
        COALESCE(SUM(e.amount), 0) as total_expenses
      FROM expenses e
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      ${monthQuery}`,
      params
    );

    const parentData = parentSummary.rows[0];
    const salaryData = teacherSalarySummary.rows[0];
    const expenseData = expensesSummary.rows[0];

    const totalIncome = parseFloat(parentData.total_collected || 0);
    const totalSalaryPaid = parseFloat(salaryData.total_salary_paid || 0);
    const totalExpenses = parseFloat(expenseData.total_expenses || 0);
    const netBalance = totalIncome - totalSalaryPaid - totalExpenses;

    // Get detailed parent fee records - Handle errors gracefully
    let parentDetailsResult = { rows: [] };
    try {
      const parentDetailsQuery = `
        SELECT 
          p.parent_name,
          p.phone_number,
          p.monthly_fee_amount,
          pmf.amount_paid_this_month,
          pmf.outstanding_after_payment,
          pmf.status
        FROM parent_month_fee pmf
        JOIN parents p ON pmf.parent_id = p.id
        JOIN billing_months bm ON pmf.billing_month_id = bm.id
        ${monthQuery}
        ORDER BY p.parent_name
        LIMIT 100
      `;
      parentDetailsResult = await pool.query(parentDetailsQuery, params);
    } catch (err) {
      console.error('Error fetching parent details for PDF:', err);
    }

    // Get detailed teacher salary records - Handle errors gracefully
    let teacherDetailsResult = { rows: [] };
    try {
      const teacherDetailsQuery = `
        SELECT 
          t.full_name,
          t.department,
          t.monthly_salary_amount,
          tsr.total_due_this_month,
          tsr.amount_paid_this_month,
          tsr.outstanding_after_payment,
          tsr.status
        FROM teacher_salary_records tsr
        JOIN teachers t ON tsr.teacher_id = t.id
        JOIN billing_months bm ON tsr.billing_month_id = bm.id
        ${monthQuery}
        ORDER BY t.full_name
        LIMIT 100
      `;
      teacherDetailsResult = await pool.query(teacherDetailsQuery, params);
    } catch (err) {
      console.error('Error fetching teacher details for PDF:', err);
    }

    // Get detailed expenses - Handle errors gracefully
    let expensesDetailsResult = { rows: [] };
    try {
      let expensesDetailsQuery = `
        SELECT 
          e.expense_date,
          ec.category_name,
          e.amount,
          e.notes
        FROM expenses e
        JOIN expense_categories ec ON e.category_id = ec.id
        LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
      `;
      if (month) {
        const [year, monthNum] = month.split('-');
        expensesDetailsQuery += ' WHERE (bm.year = $1 AND bm.month = $2) OR (bm.id IS NULL AND EXTRACT(YEAR FROM e.expense_date) = $1 AND EXTRACT(MONTH FROM e.expense_date) = $2)';
        expensesDetailsQuery += ' ORDER BY e.expense_date DESC LIMIT 100';
        const expenseParams = [parseInt(year), parseInt(monthNum)];
        expensesDetailsResult = await pool.query(expensesDetailsQuery, expenseParams);
      } else {
        expensesDetailsQuery += ' WHERE bm.is_active = true OR bm.id IS NULL';
        expensesDetailsQuery += ' ORDER BY e.expense_date DESC LIMIT 100';
        expensesDetailsResult = await pool.query(expensesDetailsQuery);
      }
    } catch (err) {
      console.error('Error fetching expense details for PDF:', err);
    }

    // Get month info
    let monthInfo = 'Current Active Month';
    if (month) {
      const [year, monthNum] = month.split('-');
      monthInfo = new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=complete-report-${month || 'active'}.pdf`);

    doc.pipe(res);

    // Header with better formatting
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#1f2937').text('Rowdatul Iimaan School', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#374151').text('Complete Financial Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica').fillColor('#6b7280').text(`Period: ${monthInfo}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fillColor('#000000');
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(2).stroke();
    doc.strokeColor('#000000').lineWidth(1);
    doc.moveDown(1.5);

    // Parent Fees Section with better alignment
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1f2937').text('Parent Fees Summary', 50, doc.y);
    doc.moveDown(0.8);
    doc.fontSize(11).font('Helvetica');
    doc.fillColor('#000000');
    
    const feeData = [
      ['Total Parents:', parentData.total_parents || 0],
      ['Fully Paid:', parentData.paid_count || 0],
      ['Unpaid:', parentData.unpaid_count || 0],
      ['Partial:', parentData.partial_count || 0],
      ['Advanced:', parentData.advanced_count || 0],
      ['Total Collected:', `$${parseFloat(parentData.total_collected || 0).toLocaleString()}`],
      ['Total Outstanding:', `$${parseFloat(parentData.total_outstanding || 0).toLocaleString()}`],
      ['Total Advance Value:', `$${parseFloat(parentData.total_advance_value || 0).toLocaleString()}`],
    ];

    feeData.forEach(([label, value], index) => {
      const yPos = doc.y;
      doc.font('Helvetica').text(`${label}`, 50, yPos, { width: 220 });
      doc.font('Helvetica-Bold').text(value, 280, yPos, { width: 265 });
      doc.moveDown(0.5);
    });

    doc.moveDown(1.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.strokeColor('#000000').lineWidth(1);
    doc.moveDown(1);

    // Teacher Salary Section with better alignment
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1f2937').text('Teacher Salary Summary', 50, doc.y);
    doc.moveDown(0.8);
    doc.fontSize(11).font('Helvetica');
    doc.fillColor('#000000');

    const salaryDataRows = [
      ['Total Salary Required:', `$${parseFloat(salaryData.total_salary_required || 0).toLocaleString()}`],
      ['Total Salary Paid:', `$${parseFloat(salaryData.total_salary_paid || 0).toLocaleString()}`],
      ['Total Salary Outstanding:', `$${parseFloat(salaryData.total_salary_outstanding || 0).toLocaleString()}`],
    ];

    salaryDataRows.forEach(([label, value]) => {
      const yPos = doc.y;
      doc.font('Helvetica').text(`${label}`, 50, yPos, { width: 220 });
      doc.font('Helvetica-Bold').text(value, 280, yPos, { width: 265 });
      doc.moveDown(0.5);
    });

    doc.moveDown(1.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.strokeColor('#000000').lineWidth(1);
    doc.moveDown(1);

    // Expenses Section with better alignment
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1f2937').text('Expenses Summary', 50, doc.y);
    doc.moveDown(0.8);
    doc.fontSize(11).font('Helvetica');
    doc.fillColor('#000000');
    const yPos = doc.y;
    doc.text('Total Expenses:', 50, yPos, { width: 220 });
    doc.font('Helvetica-Bold').text(`$${parseFloat(expenseData.total_expenses || 0).toLocaleString()}`, 280, yPos, { width: 265 });
    doc.font('Helvetica');

    doc.moveDown(1.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.strokeColor('#000000').lineWidth(1);
    doc.moveDown(1.5);

    // Net Balance Section with better formatting
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1f2937').text('Net Balance Calculation', 50, doc.y);
    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica');
    doc.fillColor('#000000');
    
    const calculationRows = [
      ['Total Income (Fees Collected):', `$${totalIncome.toLocaleString()}`],
      ['Less: Salary Paid:', `$${totalSalaryPaid.toLocaleString()}`],
      ['Less: Expenses:', `$${totalExpenses.toLocaleString()}`],
    ];

    calculationRows.forEach(([label, value]) => {
      const yPos = doc.y;
      doc.text(`${label}`, 50, yPos, { width: 220 });
      doc.font('Helvetica-Bold').text(value, 280, yPos, { width: 265 });
      doc.font('Helvetica');
      doc.moveDown(0.6);
    });

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#374151').lineWidth(2).stroke();
    doc.strokeColor('#000000').lineWidth(1);
    doc.moveDown(0.8);

    doc.fontSize(16).font('Helvetica-Bold');
    const finalY = doc.y;
    doc.text('Net Balance:', 50, finalY, { width: 220 });
    doc.fillColor(netBalance >= 0 ? '#059669' : '#dc2626');
    doc.text(`$${netBalance.toLocaleString()}`, 280, finalY, { width: 265 });
    doc.fillColor('#000000');

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Detailed Parent Fees Section with better formatting
    if (parentDetailsResult.rows.length > 0) {
      if (doc.y > 650) {
        doc.addPage();
        doc.y = 50;
      }
      
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1f2937').text('Detailed Parent Fee Records', 50, doc.y);
      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica');
      doc.fillColor('#000000');
      
      // Table headers with better alignment
      doc.font('Helvetica-Bold').fontSize(10);
      const headerY = doc.y;
      doc.text('Parent Name', 50, headerY, { width: 120 });
      doc.text('Phone', 170, headerY, { width: 90 });
      doc.text('Fee', 260, headerY, { width: 70 });
      doc.text('Paid', 330, headerY, { width: 70 });
      doc.text('Outstanding', 400, headerY, { width: 80 });
      doc.text('Status', 480, headerY, { width: 65 });
      doc.font('Helvetica');
      doc.moveDown(0.4);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#374151').lineWidth(1.5).stroke();
      doc.strokeColor('#000000').lineWidth(1);
      doc.moveDown(0.3);

      let currentY = doc.y;
      parentDetailsResult.rows.forEach((row, index) => {
        if (currentY > 720) {
          doc.addPage();
          currentY = 50;
          doc.fontSize(10).font('Helvetica-Bold');
          doc.text('Parent Name', 50, currentY, { width: 120 });
          doc.text('Phone', 170, currentY, { width: 90 });
          doc.text('Fee', 260, currentY, { width: 70 });
          doc.text('Paid', 330, currentY, { width: 70 });
          doc.text('Outstanding', 400, currentY, { width: 80 });
          doc.text('Status', 480, currentY, { width: 65 });
          doc.font('Helvetica');
          currentY += 18;
          doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor('#374151').lineWidth(1.5).stroke();
          doc.strokeColor('#000000').lineWidth(1);
          currentY += 8;
        }

        doc.fontSize(9);
        doc.text(row.parent_name || '-', 50, currentY, { width: 120 });
        doc.text(row.phone_number || '-', 170, currentY, { width: 90 });
        doc.text(`$${parseFloat(row.monthly_fee_amount || 0).toFixed(2)}`, 260, currentY, { width: 70 });
        doc.text(`$${parseFloat(row.amount_paid_this_month || 0).toFixed(2)}`, 330, currentY, { width: 70 });
        doc.text(`$${parseFloat(row.outstanding_after_payment || 0).toFixed(2)}`, 400, currentY, { width: 80 });
        doc.text(row.status || '-', 480, currentY, { width: 65 });
        currentY += 14;
      });

      doc.y = currentY;
      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.strokeColor('#000000').lineWidth(1);
      doc.moveDown(1.5);
    }

    // Detailed Teacher Salary Section with better formatting
    if (teacherDetailsResult.rows.length > 0) {
      if (doc.y > 650) {
        doc.addPage();
        doc.y = 50;
      }

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1f2937').text('Detailed Teacher Salary Records', 50, doc.y);
      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica');
      doc.fillColor('#000000');
      
      doc.font('Helvetica-Bold').fontSize(10);
      const teacherStartY = doc.y;
      doc.text('Teacher Name', 50, doc.y, { width: 130 });
      doc.text('Department', 180, doc.y, { width: 100 });
      doc.text('Salary', 280, doc.y, { width: 70 });
      doc.text('Paid', 350, doc.y, { width: 70 });
      doc.text('Outstanding', 420, doc.y, { width: 85 });
      doc.text('Status', 505, doc.y, { width: 40 });
      doc.font('Helvetica');
      doc.moveDown(0.4);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#374151').lineWidth(1.5).stroke();
      doc.strokeColor('#000000').lineWidth(1);
      doc.moveDown(0.3);

      let teacherY = doc.y;
      teacherDetailsResult.rows.forEach((row) => {
        if (teacherY > 720) {
          doc.addPage();
          teacherY = 50;
          doc.fontSize(10).font('Helvetica-Bold');
          doc.text('Teacher Name', 50, teacherY, { width: 130 });
          doc.text('Department', 180, teacherY, { width: 100 });
          doc.text('Salary', 280, teacherY, { width: 70 });
          doc.text('Paid', 350, teacherY, { width: 70 });
          doc.text('Outstanding', 420, teacherY, { width: 85 });
          doc.text('Status', 505, teacherY, { width: 40 });
          doc.font('Helvetica');
          teacherY += 18;
          doc.moveTo(50, teacherY).lineTo(545, teacherY).strokeColor('#374151').lineWidth(1.5).stroke();
          doc.strokeColor('#000000').lineWidth(1);
          teacherY += 8;
        }

        doc.fontSize(9);
        doc.text(row.full_name || '-', 50, teacherY, { width: 130 });
        doc.text(row.department || '-', 180, teacherY, { width: 100 });
        doc.text(`$${parseFloat(row.monthly_salary_amount || 0).toFixed(2)}`, 280, teacherY, { width: 70 });
        doc.text(`$${parseFloat(row.amount_paid_this_month || 0).toFixed(2)}`, 350, teacherY, { width: 70 });
        doc.text(`$${parseFloat(row.outstanding_after_payment || 0).toFixed(2)}`, 420, teacherY, { width: 85 });
        doc.text(row.status || '-', 505, teacherY, { width: 40 });
        teacherY += 14;
      });

      doc.y = teacherY;
      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.strokeColor('#000000').lineWidth(1);
      doc.moveDown(1.5);
    }

    // Detailed Expenses Section with better formatting
    if (expensesDetailsResult.rows.length > 0) {
      if (doc.y > 650) {
        doc.addPage();
        doc.y = 50;
      }

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1f2937').text('Detailed Expenses', 50, doc.y);
      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica');
      doc.fillColor('#000000');
      
      doc.font('Helvetica-Bold').fontSize(10);
      const expenseStartY = doc.y;
      doc.text('Date', 50, doc.y, { width: 90 });
      doc.text('Category', 140, doc.y, { width: 120 });
      doc.text('Amount', 260, doc.y, { width: 80 });
      doc.text('Description', 340, doc.y, { width: 205 });
      doc.font('Helvetica');
      doc.moveDown(0.4);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#374151').lineWidth(1.5).stroke();
      doc.strokeColor('#000000').lineWidth(1);
      doc.moveDown(0.3);

      let expenseY = doc.y;
      expensesDetailsResult.rows.forEach((row) => {
        if (expenseY > 720) {
          doc.addPage();
          expenseY = 50;
          doc.fontSize(10).font('Helvetica-Bold');
          doc.text('Date', 50, expenseY, { width: 90 });
          doc.text('Category', 140, expenseY, { width: 120 });
          doc.text('Amount', 260, expenseY, { width: 80 });
          doc.text('Description', 340, expenseY, { width: 205 });
          doc.font('Helvetica');
          expenseY += 18;
          doc.moveTo(50, expenseY).lineTo(545, expenseY).strokeColor('#374151').lineWidth(1.5).stroke();
          doc.strokeColor('#000000').lineWidth(1);
          expenseY += 8;
        }

        doc.fontSize(9);
        const expenseDate = row.expense_date ? new Date(row.expense_date).toLocaleDateString() : '-';
        doc.text(expenseDate, 50, expenseY, { width: 90 });
        doc.text(row.category_name || '-', 140, expenseY, { width: 120 });
        doc.text(`$${parseFloat(row.amount || 0).toFixed(2)}`, 260, expenseY, { width: 80 });
        doc.text(row.notes || '-', 340, expenseY, { width: 205 });
        expenseY += 14;
      });

      doc.y = expenseY;
      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.strokeColor('#000000').lineWidth(1);
      doc.moveDown(1.5);
    }

    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#374151').lineWidth(2).stroke();
    doc.strokeColor('#000000').lineWidth(1);
    doc.moveDown(1.5);

    // Footer with better formatting
    doc.fontSize(11).font('Helvetica').fillColor('#6b7280').text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).text('This is a computer-generated report containing all financial data.', { align: 'center' });
    doc.fillColor('#000000');

    doc.end();
  } catch (error) {
    console.error('Export PDF error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export PDF',
      message: error.message || 'An error occurred while exporting. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;


