import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../database/db.js';
import { authenticateToken, requireAdmin, requireSchoolContext, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store school logos under backend/uploads/schools/<schoolId>/
const uploadRoot = path.join(__dirname, '..', 'uploads', 'schools');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // temp folder; we will move after we have a school id
    const tmpDir = path.join(uploadRoot, '_tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `logo${ext}`);
  },
});

const upload = multer({ storage });

const DEFAULT_EXPENSE_CATEGORIES = [
  ['Maintenance', 'Building and facility maintenance costs'],
  ['Books', 'Educational books and materials'],
  ['Electricity', 'Electricity bills'],
  ['Water', 'Water bills'],
  ['Cleaning', 'Cleaning supplies and services'],
  ['Other', 'Other miscellaneous expenses'],
];

// Platform overview: schools + per-school totals (Super Admin only)
router.get('/overview', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      WITH active_months AS (
        SELECT school_id, id AS billing_month_id
        FROM billing_months
        WHERE is_active = true
      ),
      students AS (
        SELECT school_id, COUNT(*)::int AS total_students
        FROM parents
        GROUP BY school_id
      ),
      collected AS (
        SELECT p.school_id, COALESCE(SUM(p.amount), 0)::numeric AS total_collected_this_month
        FROM payments p
        JOIN active_months am
          ON am.school_id = p.school_id
         AND am.billing_month_id = p.billing_month_id
        GROUP BY p.school_id
      )
      SELECT
        s.id,
        s.name,
        s.email,
        s.phone,
        s.logo_path,
        s.is_active,
        s.created_at,
        COALESCE(st.total_students, 0) AS total_students,
        COALESCE(c.total_collected_this_month, 0) AS total_collected_this_month
      FROM schools s
      LEFT JOIN students st ON st.school_id = s.id
      LEFT JOIN collected c ON c.school_id = s.id
      ORDER BY s.created_at DESC
    `);

    const schools = result.rows;
    const summary = {
      total_schools: schools.length,
      total_students: schools.reduce((acc, s) => acc + (parseInt(s.total_students) || 0), 0),
      total_collected_this_month: schools.reduce((acc, s) => acc + (parseFloat(s.total_collected_this_month) || 0), 0),
    };

    res.json({ summary, schools });
  } catch (error) {
    console.error('Schools overview error:', error);
    res.status(500).json({ error: 'Failed to load schools overview' });
  }
});

// List schools
router.get('/', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, phone, logo_path, is_active, created_at
       FROM schools
       ORDER BY created_at DESC`
    );
    res.json({ schools: result.rows });
  } catch (error) {
    console.error('List schools error:', error);
    res.status(500).json({ error: 'Failed to list schools' });
  }
});

// Create school + first school admin
router.post(
  '/',
  authenticateToken,
  requireSuperAdmin,
  upload.single('logo'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        name,
        email,
        phone,
        admin_username,
        admin_email,
        admin_password,
      } = req.body;

      if (!name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'School name is required' });
      }
      if (!admin_username || !admin_email || !admin_password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Admin username, email, and password are required' });
      }

      const schoolResult = await client.query(
        `INSERT INTO schools (name, email, phone)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, phone, logo_path, is_active, created_at`,
        [name, email || null, phone || null]
      );

      const school = schoolResult.rows[0];

      // Move logo (if provided) into the school folder and store a public path under /api/uploads
      if (req.file) {
        const schoolDir = path.join(uploadRoot, String(school.id));
        fs.mkdirSync(schoolDir, { recursive: true });

        const ext = path.extname(req.file.filename) || path.extname(req.file.originalname || '') || '.png';
        const finalFilename = `logo${ext.toLowerCase()}`;
        const finalPath = path.join(schoolDir, finalFilename);

        fs.renameSync(req.file.path, finalPath);

        const publicLogoPath = `/api/uploads/schools/${school.id}/${finalFilename}`;
        await client.query('UPDATE schools SET logo_path = $1 WHERE id = $2', [publicLogoPath, school.id]);
        school.logo_path = publicLogoPath;
      }

      // Create first school admin user
      const passwordHash = await bcrypt.hash(admin_password, 10);
      const userResult = await client.query(
        `INSERT INTO users (username, email, password_hash, role, school_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, role, school_id, created_at`,
        [admin_username, admin_email, passwordHash, 'school_admin', school.id]
      );

      // Seed expense categories for this school
      for (const [category_name, description] of DEFAULT_EXPENSE_CATEGORIES) {
        await client.query(
          `INSERT INTO expense_categories (school_id, category_name, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (school_id, category_name) DO NOTHING`,
          [school.id, category_name, description]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        school,
        admin_user: userResult.rows[0],
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create school error:', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'School or admin username/email already exists' });
      }
      res.status(500).json({ error: 'Failed to create school' });
    } finally {
      client.release();
    }
  }
);

// Update school (name/email/phone/logo/is_active)
router.put(
  '/:id',
  authenticateToken,
  requireSuperAdmin,
  upload.single('logo'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schoolId = parseInt(req.params.id);
      const { name, email, phone, is_active } = req.body;

      const schoolCheck = await client.query('SELECT * FROM schools WHERE id = $1', [schoolId]);
      if (schoolCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'School not found' });
      }

      const updateResult = await client.query(
        `UPDATE schools
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             phone = COALESCE($3, phone),
             is_active = COALESCE($4, is_active)
         WHERE id = $5
         RETURNING id, name, email, phone, logo_path, is_active, created_at`,
        [name || null, email || null, phone || null, is_active !== undefined ? is_active : null, schoolId]
      );

      const school = updateResult.rows[0];

      if (req.file) {
        const schoolDir = path.join(uploadRoot, String(schoolId));
        fs.mkdirSync(schoolDir, { recursive: true });

        const ext = path.extname(req.file.filename) || path.extname(req.file.originalname || '') || '.png';
        const finalFilename = `logo${ext.toLowerCase()}`;
        const finalPath = path.join(schoolDir, finalFilename);
        fs.renameSync(req.file.path, finalPath);

        const publicLogoPath = `/api/uploads/schools/${schoolId}/${finalFilename}`;
        await client.query('UPDATE schools SET logo_path = $1 WHERE id = $2', [publicLogoPath, schoolId]);
        school.logo_path = publicLogoPath;
      }

      await client.query('COMMIT');
      res.json({ school });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update school error:', error);
      res.status(500).json({ error: 'Failed to update school' });
    } finally {
      client.release();
    }
  }
);

// Delete school (Super Admin only)
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const schoolId = parseInt(req.params.id);

    const schoolRes = await client.query('SELECT id FROM schools WHERE id = $1', [schoolId]);
    if (schoolRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'School not found' });
    }

    await client.query('DELETE FROM schools WHERE id = $1', [schoolId]);
    await client.query('COMMIT');

    // best-effort: delete logo folder
    try {
      const schoolDir = path.join(uploadRoot, String(schoolId));
      fs.rmSync(schoolDir, { recursive: true, force: true });
    } catch (_) {
      // ignore
    }

    res.json({ message: 'School deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete school error:', error);
    res.status(500).json({ error: 'Failed to delete school' });
  } finally {
    client.release();
  }
});

// Get current user's school (school admin/staff)
router.get('/me', authenticateToken, requireSchoolContext, async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const result = await pool.query(
      'SELECT id, name, email, phone, logo_path, is_active, created_at FROM schools WHERE id = $1',
      [schoolId]
    );
    res.json({ school: result.rows[0] || null });
  } catch (error) {
    console.error('Get my school error:', error);
    res.status(500).json({ error: 'Failed to fetch school' });
  }
});

// Update current school branding (school admin)
router.put('/me', authenticateToken, requireSchoolContext, requireAdmin, upload.single('logo'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const schoolId = req.user.school_id;

    const { name, email, phone } = req.body;

    const updateResult = await client.query(
      `UPDATE schools
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone)
       WHERE id = $4
       RETURNING id, name, email, phone, logo_path, is_active, created_at`,
      [name || null, email || null, phone || null, schoolId]
    );

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'School not found' });
    }

    const school = updateResult.rows[0];

    if (req.file) {
      const schoolDir = path.join(uploadRoot, String(schoolId));
      fs.mkdirSync(schoolDir, { recursive: true });

      const ext = path.extname(req.file.filename) || path.extname(req.file.originalname || '') || '.png';
      const finalFilename = `logo${ext.toLowerCase()}`;
      const finalPath = path.join(schoolDir, finalFilename);
      fs.renameSync(req.file.path, finalPath);

      const publicLogoPath = `/api/uploads/schools/${schoolId}/${finalFilename}`;
      await client.query('UPDATE schools SET logo_path = $1 WHERE id = $2', [publicLogoPath, schoolId]);
      school.logo_path = publicLogoPath;
    }

    await client.query('COMMIT');
    res.json({ school });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update my school error:', error);
    res.status(500).json({ error: 'Failed to update school branding' });
  } finally {
    client.release();
  }
});

export default router;



