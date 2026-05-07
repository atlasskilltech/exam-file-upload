// File controller — upload, list, download, delete logic
const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const activityLog = require('../services/activityLog');

// GET /files — list files with search, filter, sort, pagination
exports.listFiles = async (req, res) => {
  try {
    const user = req.session.user;
    const { search, category, type, sort, page } = req.query;
    const perPage = 20;
    const currentPage = parseInt(page) || 1;
    const offset = (currentPage - 1) * perPage;

    let query = 'SELECT f.*, c.name AS category_name, u.username AS uploader FROM uploaded_files f LEFT JOIN categories c ON f.category_id = c.id LEFT JOIN users u ON f.uploaded_by = u.id';
    let countQuery = 'SELECT COUNT(*) AS total FROM uploaded_files f';
    const conditions = [];
    const params = [];

    // Non-admin users only see their own files
    if (user.role !== 'admin') {
      conditions.push('f.uploaded_by = ?');
      params.push(user.id);
    }

    // Search by filename
    if (search) {
      conditions.push('f.original_name LIKE ?');
      params.push(`%${search}%`);
    }

    // Filter by category
    if (category) {
      conditions.push('f.category_id = ?');
      params.push(parseInt(category));
    }

    // Filter by file type group
    if (type) {
      const typeMap = {
        image: ['image/%'],
        video: ['video/%'],
        pdf: ['application/pdf'],
        doc: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/%'],
        other: null // handled separately
      };
      if (type === 'other') {
        conditions.push("f.mime_type NOT LIKE 'image/%' AND f.mime_type NOT LIKE 'video/%' AND f.mime_type != 'application/pdf' AND f.mime_type NOT LIKE 'application/msword' AND f.mime_type NOT LIKE 'application/vnd.openxmlformats%' AND f.mime_type NOT LIKE 'text/%'");
      } else if (typeMap[type]) {
        const likeClauses = typeMap[type].map(() => 'f.mime_type LIKE ?').join(' OR ');
        conditions.push(`(${likeClauses})`);
        params.push(...typeMap[type]);
      }
    }

    // Build WHERE clause
    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    // Sort
    const sortMap = {
      newest: 'f.uploaded_at DESC',
      oldest: 'f.uploaded_at ASC',
      largest: 'f.size_bytes DESC',
      smallest: 'f.size_bytes ASC'
    };
    query += ' ORDER BY ' + (sortMap[sort] || 'f.uploaded_at DESC');

    // Pagination
    query += ' LIMIT ? OFFSET ?';

    // Get total count
    const [countRows] = await pool.execute(countQuery, params);
    const total = countRows[0].total;

    // Get paginated results
    const [rows] = await pool.execute(query, [...params, String(perPage), String(offset)]);

    return res.json({
      success: true,
      data: {
        files: rows,
        pagination: {
          page: currentPage,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage)
        }
      }
    });
  } catch (err) {
    console.error('List files error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch files' });
  }
};

// POST /files/upload — handle file upload
exports.uploadFiles = async (req, res) => {
  try {
    const user = req.session.user;
    const categoryId = req.body.category_id || null;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files selected' });
    }

    const results = [];
    for (const file of files) {
      // Insert file record
      const [result] = await pool.execute(
        'INSERT INTO uploaded_files (original_name, stored_name, mime_type, size_bytes, category_id, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
        [file.originalname, file.filename, file.mimetype, file.size, categoryId, user.id]
      );

      // Log the action
      await pool.execute(
        'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
        [user.id, 'uploaded file', file.originalname]
      );

      results.push({
        id: result.insertId,
        original_name: file.originalname,
        size_bytes: file.size,
        mime_type: file.mimetype
      });
    }

    return res.json({ success: true, data: results });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ success: false, message: 'Upload failed' });
  }
};

// GET /files/download/:id — send file for download
exports.downloadFile = async (req, res) => {
  try {
    const user = req.session.user;
    const fileId = req.params.id;

    let query = 'SELECT * FROM uploaded_files WHERE id = ?';
    const params = [fileId];

    // Non-admin can only download own files
    if (user.role !== 'admin') {
      query += ' AND uploaded_by = ?';
      params.push(user.id);
    }

    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const file = rows[0];
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file.stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    await activityLog.log(req, 'downloaded file', file.original_name);

    res.download(filePath, file.original_name);
  } catch (err) {
    console.error('Download error:', err);
    return res.status(500).json({ success: false, message: 'Download failed' });
  }
};

// DELETE /files/delete/:id — delete a file
exports.deleteFile = async (req, res) => {
  try {
    const user = req.session.user;
    const fileId = req.params.id;

    let query = 'SELECT * FROM uploaded_files WHERE id = ?';
    const params = [fileId];

    if (user.role !== 'admin') {
      query += ' AND uploaded_by = ?';
      params.push(user.id);
    }

    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const file = rows[0];
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file.stored_name);

    // Delete from disk
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await pool.execute('DELETE FROM uploaded_files WHERE id = ?', [fileId]);

    // Log the action
    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'deleted file', file.original_name]
    );

    return res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ success: false, message: 'Delete failed' });
  }
};
