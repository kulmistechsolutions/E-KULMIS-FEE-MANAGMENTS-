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

    let monthQuery = '';
    const params = [];
    let paramIndex = 1;

    if (month) {
      const [year, monthNum] = month.split('-');
      monthQuery = 'WHERE bm.year = $1 AND bm.month = $2';
      params.push(year, monthNum);
      paramIndex = 3;
    } else {
      monthQuery = 'WHERE bm.is_active = true';
    }

    // 1. Parent Fee Records
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

    const parentResult = await pool.query(parentQuery, params);

    // 2. Teacher Salary Records
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

    const teacherSalaryResult = await pool.query(teacherSalaryQuery, params);

    // 3. Expenses List
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
      expenseParams.push(year, monthNum);
    } else {
      expensesQuery += ' WHERE bm.is_active = true OR bm.id IS NULL';
    }

    expensesQuery += ' ORDER BY e.expense_date DESC';

    const expensesResult = await pool.query(expensesQuery, month ? expenseParams : []);

    // 4. Summary Sheet - Get expenses separately to avoid complex subquery
    let expensesSummaryQuery = `
      SELECT COALESCE(SUM(e.amount), 0) as total_expenses
      FROM expenses e
      LEFT JOIN billing_months bm ON e.billing_month_id = bm.id
    `;
    const expensesSummaryParams = [];
    if (month) {
      const [year, monthNum] = month.split('-');
      expensesSummaryQuery += ' WHERE (bm.year = $1 AND bm.month = $2) OR (bm.id IS NULL AND EXTRACT(YEAR FROM e.expense_date) = $1 AND EXTRACT(MONTH FROM e.expense_date) = $2)';
      expensesSummaryParams.push(year, monthNum);
    } else {
      expensesSummaryQuery += ' WHERE bm.is_active = true OR bm.id IS NULL';
    }
    const expensesSummaryResult = await pool.query(expensesSummaryQuery, expensesSummaryParams);
    const totalExpenses = parseFloat(expensesSummaryResult.rows[0]?.total_expenses || 0);

    // Get summary data
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

    // Calculate net balance
    const summaryRow = summaryData.rows[0] || {};
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
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to export Excel',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while exporting. Please try again.'
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

    // Get detailed parent fee records
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
    const parentDetailsResult = await pool.query(parentDetailsQuery, params);

    // Get detailed teacher salary records
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
    const teacherDetailsResult = await pool.query(teacherDetailsQuery, params);

    // Get detailed expenses
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
    let expensesDetailsResult;
    if (month) {
      const [year, monthNum] = month.split('-');
      expensesDetailsQuery += ' WHERE (bm.year = $1 AND bm.month = $2) OR (bm.id IS NULL AND EXTRACT(YEAR FROM e.expense_date) = $1 AND EXTRACT(MONTH FROM e.expense_date) = $2)';
      expensesDetailsQuery += ' ORDER BY e.expense_date DESC LIMIT 100';
      const expenseParams = [year, monthNum];
      expensesDetailsResult = await pool.query(expensesDetailsQuery, expenseParams);
    } else {
      expensesDetailsQuery += ' WHERE bm.is_active = true OR bm.id IS NULL';
      expensesDetailsQuery += ' ORDER BY e.expense_date DESC LIMIT 100';
      expensesDetailsResult = await pool.query(expensesDetailsQuery);
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

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Rowdatul Iimaan School', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').text('Complete Financial Report', { align: 'center' });
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

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Detailed Parent Fees Section
    if (parentDetailsResult.rows.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Detailed Parent Fee Records', 50, doc.y);
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica');
      
      // Table headers
      const startY = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Parent Name', 50, doc.y, { width: 120 });
      doc.text('Phone', 170, doc.y, { width: 80 });
      doc.text('Fee', 250, doc.y, { width: 60 });
      doc.text('Paid', 310, doc.y, { width: 60 });
      doc.text('Outstanding', 370, doc.y, { width: 70 });
      doc.text('Status', 440, doc.y, { width: 60 });
      doc.font('Helvetica');
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.2);

      let currentY = doc.y;
      parentDetailsResult.rows.forEach((row, index) => {
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('Parent Name', 50, currentY, { width: 120 });
          doc.text('Phone', 170, currentY, { width: 80 });
          doc.text('Fee', 250, currentY, { width: 60 });
          doc.text('Paid', 310, currentY, { width: 60 });
          doc.text('Outstanding', 370, currentY, { width: 70 });
          doc.text('Status', 440, currentY, { width: 60 });
          doc.font('Helvetica');
          currentY += 15;
          doc.moveTo(50, currentY).lineTo(545, currentY).stroke();
          currentY += 10;
        }

        doc.fontSize(8);
        doc.text(row.parent_name || '-', 50, currentY, { width: 120 });
        doc.text(row.phone_number || '-', 170, currentY, { width: 80 });
        doc.text(`$${parseFloat(row.monthly_fee_amount || 0).toFixed(2)}`, 250, currentY, { width: 60 });
        doc.text(`$${parseFloat(row.amount_paid_this_month || 0).toFixed(2)}`, 310, currentY, { width: 60 });
        doc.text(`$${parseFloat(row.outstanding_after_payment || 0).toFixed(2)}`, 370, currentY, { width: 70 });
        doc.text(row.status || '-', 440, currentY, { width: 60 });
        currentY += 12;
      });

      doc.y = currentY;
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);
    }

    // Detailed Teacher Salary Section
    if (teacherDetailsResult.rows.length > 0) {
      if (doc.y > 650) {
        doc.addPage();
        doc.y = 50;
      }

      doc.fontSize(14).font('Helvetica-Bold').text('Detailed Teacher Salary Records', 50, doc.y);
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica');
      
      doc.font('Helvetica-Bold');
      const teacherStartY = doc.y;
      doc.text('Teacher Name', 50, doc.y, { width: 120 });
      doc.text('Department', 170, doc.y, { width: 100 });
      doc.text('Salary', 270, doc.y, { width: 60 });
      doc.text('Paid', 330, doc.y, { width: 60 });
      doc.text('Outstanding', 390, doc.y, { width: 70 });
      doc.text('Status', 460, doc.y, { width: 60 });
      doc.font('Helvetica');
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.2);

      let teacherY = doc.y;
      teacherDetailsResult.rows.forEach((row) => {
        if (teacherY > 700) {
          doc.addPage();
          teacherY = 50;
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('Teacher Name', 50, teacherY, { width: 120 });
          doc.text('Department', 170, teacherY, { width: 100 });
          doc.text('Salary', 270, teacherY, { width: 60 });
          doc.text('Paid', 330, teacherY, { width: 60 });
          doc.text('Outstanding', 390, teacherY, { width: 70 });
          doc.text('Status', 460, teacherY, { width: 60 });
          doc.font('Helvetica');
          teacherY += 15;
          doc.moveTo(50, teacherY).lineTo(545, teacherY).stroke();
          teacherY += 10;
        }

        doc.fontSize(8);
        doc.text(row.full_name || '-', 50, teacherY, { width: 120 });
        doc.text(row.department || '-', 170, teacherY, { width: 100 });
        doc.text(`$${parseFloat(row.monthly_salary_amount || 0).toFixed(2)}`, 270, teacherY, { width: 60 });
        doc.text(`$${parseFloat(row.amount_paid_this_month || 0).toFixed(2)}`, 330, teacherY, { width: 60 });
        doc.text(`$${parseFloat(row.outstanding_after_payment || 0).toFixed(2)}`, 390, teacherY, { width: 70 });
        doc.text(row.status || '-', 460, teacherY, { width: 60 });
        teacherY += 12;
      });

      doc.y = teacherY;
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);
    }

    // Detailed Expenses Section
    if (expensesDetailsResult.rows.length > 0) {
      if (doc.y > 650) {
        doc.addPage();
        doc.y = 50;
      }

      doc.fontSize(14).font('Helvetica-Bold').text('Detailed Expenses', 50, doc.y);
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica');
      
      doc.font('Helvetica-Bold');
      const expenseStartY = doc.y;
      doc.text('Date', 50, doc.y, { width: 80 });
      doc.text('Category', 130, doc.y, { width: 100 });
      doc.text('Amount', 230, doc.y, { width: 70 });
      doc.text('Description', 300, doc.y, { width: 200 });
      doc.font('Helvetica');
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.2);

      let expenseY = doc.y;
      expensesDetailsResult.rows.forEach((row) => {
        if (expenseY > 700) {
          doc.addPage();
          expenseY = 50;
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('Date', 50, expenseY, { width: 80 });
          doc.text('Category', 130, expenseY, { width: 100 });
          doc.text('Amount', 230, expenseY, { width: 70 });
          doc.text('Description', 300, expenseY, { width: 200 });
          doc.font('Helvetica');
          expenseY += 15;
          doc.moveTo(50, expenseY).lineTo(545, expenseY).stroke();
          expenseY += 10;
        }

        doc.fontSize(8);
        const expenseDate = row.expense_date ? new Date(row.expense_date).toLocaleDateString() : '-';
        doc.text(expenseDate, 50, expenseY, { width: 80 });
        doc.text(row.category_name || '-', 130, expenseY, { width: 100 });
        doc.text(`$${parseFloat(row.amount || 0).toFixed(2)}`, 230, expenseY, { width: 70 });
        doc.text(row.notes || '-', 300, expenseY, { width: 200 });
        expenseY += 12;
      });

      doc.y = expenseY;
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Footer
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(8).text('This is a computer-generated report containing all financial data.', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Export PDF error:', error);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

export default router;


