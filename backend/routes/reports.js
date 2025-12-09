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

// Export to Excel
router.get('/export-excel', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM

    let query = `
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
    `;

    const params = [];
    if (month) {
      const [year, monthNum] = month.split('-');
      query += ' WHERE bm.year = $1 AND bm.month = $2';
      params.push(year, monthNum);
    } else {
      query += ' WHERE bm.is_active = true';
    }

    query += ' ORDER BY p.parent_name';

    const result = await pool.query(query, params);

    // Create workbook
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(result.rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Fee Records');

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=fee-records-${month || 'active'}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({ error: 'Failed to export Excel' });
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

    // Get month info
    let monthInfo = 'Current Active Month';
    if (month) {
      const [year, monthNum] = month.split('-');
      monthInfo = new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=financial-report-${month || 'active'}.pdf`);

    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Rowdatul Iimaan School', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').text('Financial Report', { align: 'center' });
    doc.fontSize(12).text(`Period: ${monthInfo}`, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Parent Fees Section
    doc.fontSize(14).font('Helvetica-Bold').text('Parent Fees Summary', 50, doc.y);
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
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

    feeData.forEach(([label, value]) => {
      doc.text(`${label}`, 50, doc.y, { continued: true, width: 200 });
      doc.font('Helvetica-Bold').text(value, 250, doc.y, { width: 300 });
      doc.font('Helvetica');
      doc.moveDown(0.4);
    });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Teacher Salary Section
    doc.fontSize(14).font('Helvetica-Bold').text('Teacher Salary Summary', 50, doc.y);
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    const salaryDataRows = [
      ['Total Salary Required:', `$${parseFloat(salaryData.total_salary_required || 0).toLocaleString()}`],
      ['Total Salary Paid:', `$${parseFloat(salaryData.total_salary_paid || 0).toLocaleString()}`],
      ['Total Salary Outstanding:', `$${parseFloat(salaryData.total_salary_outstanding || 0).toLocaleString()}`],
    ];

    salaryDataRows.forEach(([label, value]) => {
      doc.text(`${label}`, 50, doc.y, { continued: true, width: 200 });
      doc.font('Helvetica-Bold').text(value, 250, doc.y, { width: 300 });
      doc.font('Helvetica');
      doc.moveDown(0.4);
    });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Expenses Section
    doc.fontSize(14).font('Helvetica-Bold').text('Expenses Summary', 50, doc.y);
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text('Total Expenses:', 50, doc.y, { continued: true, width: 200 });
    doc.font('Helvetica-Bold').text(`$${parseFloat(expenseData.total_expenses || 0).toLocaleString()}`, 250, doc.y, { width: 300 });
    doc.font('Helvetica');

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Net Balance Section
    doc.fontSize(16).font('Helvetica-Bold').text('Net Balance', 50, doc.y);
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');
    
    const calculationRows = [
      ['Total Income (Fees Collected):', `$${totalIncome.toLocaleString()}`],
      ['Less: Salary Paid:', `$${totalSalaryPaid.toLocaleString()}`],
      ['Less: Expenses:', `$${totalExpenses.toLocaleString()}`],
    ];

    calculationRows.forEach(([label, value]) => {
      doc.text(`${label}`, 50, doc.y, { continued: true, width: 200 });
      doc.text(value, 250, doc.y, { width: 300 });
      doc.moveDown(0.5);
    });

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('Net Balance:', 50, doc.y, { continued: true, width: 200 });
    doc.fillColor(netBalance >= 0 ? '#059669' : '#dc2626');
    doc.text(`$${netBalance.toLocaleString()}`, 250, doc.y, { width: 300 });
    doc.fillColor('#000000');

    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Footer
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(8).text('This is a computer-generated report.', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Export PDF error:', error);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

export default router;


