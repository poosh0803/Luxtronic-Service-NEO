import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool from '../db.js';
import { nextFormId } from '../utils/formId.js';

const router = express.Router();

const UPLOAD_ROOT = path.resolve('uploads', 'service-forms');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage });

function rowToForm(row) {
  return {
    ...row,
    accessories: row.accessories ?? [],
    reported_issues: row.reported_issues ?? [],
  };
}

// Create a new draft - the wizard calls this once, on step 1, before any
// answers exist yet, so it has an id to auto-save each step against.
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const customerResult = await client.query(
      'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id',
      [req.body.customer_name || null, req.body.customer_phone || null]
    );
    const customerId = customerResult.rows[0].id;
    const { id, year, seq } = await nextFormId(client);
    const insertResult = await client.query(
      `INSERT INTO service_forms (id, year, seq_number, customer_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, year, seq, customerId]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, form: rowToForm(insertResult.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating service form draft:', error);
    res.status(500).json({ success: false, message: 'Failed to create service form', error: error.message });
  } finally {
    client.release();
  }
});

// List / search (records page)
router.get('/', async (req, res) => {
  try {
    const { q, status, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (status) {
      params.push(status);
      where += ` AND sf.status = $${params.length}`;
    } else {
      // Hide draft (unfinished, auto-saved) records from the default view -
      // they aren't real jobs yet.
      where += ` AND sf.status != 'draft'`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR sf.id ILIKE $${params.length} OR sf.model ILIKE $${params.length})`;
    }
    if (dateFrom) {
      params.push(dateFrom);
      where += ` AND sf.created_at >= $${params.length}`;
    }
    if (dateTo) {
      params.push(dateTo);
      where += ` AND sf.created_at < ($${params.length}::date + INTERVAL '1 day')`;
    }

    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM service_forms sf JOIN customers c ON c.id = sf.customer_id ${where}`,
      params
    );

    const listResult = await pool.query(
      `SELECT sf.id, sf.status, sf.service_type, sf.brand, sf.model, sf.total_cost, sf.created_at,
              c.name AS customer_name, c.phone AS customer_phone
       FROM service_forms sf JOIN customers c ON c.id = sf.customer_id
       ${where}
       ORDER BY sf.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    const total = parseInt(countResult.rows[0].total, 10);
    res.json({
      success: true,
      forms: listResult.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Error listing service forms:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch service forms', error: error.message });
  }
});

// Get one, with photos
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sf.*, c.name AS customer_name, c.phone AS customer_phone
       FROM service_forms sf JOIN customers c ON c.id = sf.customer_id
       WHERE sf.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service form not found' });
    }
    const { rows: photos } = await pool.query(
      'SELECT id, filename, original_name FROM service_photos WHERE form_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json({ success: true, form: rowToForm(rows[0]), photos });
  } catch (error) {
    console.error('Error fetching service form:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch service form', error: error.message });
  }
});

// Update - used both for per-step wizard auto-save and full detail edits.
// Only fields present in the body are touched.
router.patch('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT customer_id, parts_cost, labour_cost FROM service_forms WHERE id = $1', [
      req.params.id,
    ]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Service form not found' });
    }
    const { customer_id: customerId } = existing.rows[0];

    const body = req.body;
    if (body.customer_name !== undefined || body.customer_phone !== undefined) {
      await client.query(
        `UPDATE customers SET name = COALESCE($1, name), phone = COALESCE($2, phone) WHERE id = $3`,
        [body.customer_name ?? null, body.customer_phone ?? null, customerId]
      );
    }

    const fieldMap = {
      service_type: 'service_type',
      brand: 'brand',
      model: 'model',
      serial_number: 'serial_number',
      liquid_damaged: 'liquid_damaged',
      accessories: 'accessories',
      accessories_other: 'accessories_other',
      reported_issues: 'reported_issues',
      issue_notes: 'issue_notes',
      diagnosis_notes: 'diagnosis_notes',
      parts_cost: 'parts_cost',
      labour_cost: 'labour_cost',
      parts_breakdown: 'parts_breakdown',
      wizard_step: 'wizard_step',
    };
    const jsonFields = new Set(['accessories', 'reported_issues']);

    const setClauses = [];
    const values = [];
    // Referencing the parameter placeholder (not the column) for cost
    // fields when they're being updated - Postgres evaluates other SET
    // expressions against the row's OLD values, so referencing the column
    // name here would silently ignore the value being set in this same
    // statement.
    let partsCostExpr = 'parts_cost';
    let labourCostExpr = 'labour_cost';

    for (const [key, column] of Object.entries(fieldMap)) {
      if (body[key] === undefined) continue;
      values.push(jsonFields.has(key) ? JSON.stringify(body[key]) : body[key]);
      const paramIdx = values.length;
      setClauses.push(`${column} = $${paramIdx}`);
      if (key === 'parts_cost') partsCostExpr = `$${paramIdx}`;
      if (key === 'labour_cost') labourCostExpr = `$${paramIdx}`;
    }

    if (setClauses.length === 0) {
      await client.query('COMMIT');
      const { rows } = await pool.query('SELECT * FROM service_forms WHERE id = $1', [req.params.id]);
      return res.json({ success: true, form: rowToForm(rows[0]) });
    }

    values.push(req.params.id);
    const { rows } = await client.query(
      `UPDATE service_forms
       SET ${setClauses.join(', ')},
           total_cost = COALESCE(${partsCostExpr}, 0::numeric) + COALESCE(${labourCostExpr}, 0::numeric),
           updated_at = now()
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    await client.query('COMMIT');
    res.json({ success: true, form: rowToForm(rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating service form:', error);
    res.status(500).json({ success: false, message: 'Failed to update service form', error: error.message });
  } finally {
    client.release();
  }
});

// Submit the wizard: draft -> started. Validates the fields a real job needs.
router.post('/:id/submit', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sf.*, c.name AS customer_name, c.phone AS customer_phone
       FROM service_forms sf JOIN customers c ON c.id = sf.customer_id
       WHERE sf.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service form not found' });
    }
    const form = rows[0];

    const missing = [];
    if (!form.customer_name) missing.push('customer name');
    if (!form.customer_phone) missing.push('contact number');
    if (!form.service_type) missing.push('service type');
    if (!form.brand) missing.push('brand');
    if (!form.model) missing.push('model');
    if (missing.length > 0) {
      return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
    }

    const { rows: updated } = await pool.query(
      `UPDATE service_forms SET status = 'started', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ success: true, form: rowToForm(updated[0]) });
  } catch (error) {
    console.error('Error submitting service form:', error);
    res.status(500).json({ success: false, message: 'Failed to submit service form', error: error.message });
  }
});

// Mark the repair complete / ready for pickup
router.post('/:id/finish', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE service_forms SET status = 'finished', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service form not found' });
    }
    res.json({ success: true, form: rowToForm(rows[0]) });
  } catch (error) {
    console.error('Error finishing service form:', error);
    res.status(500).json({ success: false, message: 'Failed to finish service form', error: error.message });
  }
});

// Reopen a finished job back to in-progress
router.post('/:id/reopen', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE service_forms SET status = 'started', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service form not found' });
    }
    res.json({ success: true, form: rowToForm(rows[0]) });
  } catch (error) {
    console.error('Error reopening service form:', error);
    res.status(500).json({ success: false, message: 'Failed to reopen service form', error: error.message });
  }
});

// Delete a record (mainly for abandoned drafts)
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT customer_id FROM service_forms WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Service form not found' });
    }
    const { customer_id: customerId } = existing.rows[0];

    const { rows: photoRows } = await client.query('SELECT filename FROM service_photos WHERE form_id = $1', [req.params.id]);
    await client.query('DELETE FROM service_forms WHERE id = $1', [req.params.id]);

    const uploadDir = path.join(UPLOAD_ROOT, req.params.id);
    photoRows.forEach((row) => {
      try {
        fs.unlinkSync(path.join(uploadDir, row.filename));
      } catch {
        // file already gone - fine
      }
    });
    try {
      fs.rmdirSync(uploadDir, { recursive: true });
    } catch {
      // no photos dir - fine
    }

    const { rows: otherForms } = await client.query('SELECT COUNT(*) AS count FROM service_forms WHERE customer_id = $1', [
      customerId,
    ]);
    if (otherForms[0].count === '0') {
      await client.query('DELETE FROM customers WHERE id = $1', [customerId]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Service form deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting service form:', error);
    res.status(500).json({ success: false, message: 'Failed to delete service form', error: error.message });
  } finally {
    client.release();
  }
});

// Photos
router.post('/:id/photos', upload.array('photos', 10), async (req, res) => {
  try {
    const files = req.files || [];
    const inserted = [];
    for (const file of files) {
      const { rows } = await pool.query(
        `INSERT INTO service_photos (form_id, filename, original_name) VALUES ($1, $2, $3) RETURNING id, filename, original_name`,
        [req.params.id, file.filename, file.originalname]
      );
      inserted.push(rows[0]);
    }
    res.status(201).json({ success: true, photos: inserted });
  } catch (error) {
    console.error('Error uploading photos:', error);
    res.status(500).json({ success: false, message: 'Failed to upload photos', error: error.message });
  }
});

router.delete('/:id/photos/:photoId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT filename FROM service_photos WHERE id = $1 AND form_id = $2', [
      req.params.photoId,
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }
    await pool.query('DELETE FROM service_photos WHERE id = $1', [req.params.photoId]);
    try {
      fs.unlinkSync(path.join(UPLOAD_ROOT, req.params.id, rows[0].filename));
    } catch {
      // file already gone - fine
    }
    res.json({ success: true, message: 'Photo deleted' });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ success: false, message: 'Failed to delete photo', error: error.message });
  }
});

export default router;
