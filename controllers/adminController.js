// Admin controller — user management, logs, reports
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// GET /admin/users
exports.listUsers = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, app_id, role, created_at FROM users ORDER BY created_at DESC'
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

// POST /admin/users/add
exports.addUser = async (req, res) => {
  try {
    const { username, password, role, app_id } = req.body;

    if (!username) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const validRoles = ['admin', 'user', 'student'];
    const userRole = validRoles.includes(role) ? role : 'user';

    // Students need app_id, others need password
    if (userRole === 'student') {
      if (!app_id) {
        return res.status(400).json({ success: false, message: 'App ID is required for students' });
      }
      // Check if app_id already exists
      const [existingAppId] = await pool.execute('SELECT id FROM users WHERE app_id = ?', [app_id.trim()]);
      if (existingAppId.length > 0) {
        return res.status(409).json({ success: false, message: 'App ID already exists' });
      }
    } else {
      if (!password) {
        return res.status(400).json({ success: false, message: 'Password is required' });
      }
    }

    // Check if username exists
    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }

    // Hash password (null for students)
    const hashed = password ? await bcrypt.hash(password, 10) : null;
    const cleanAppId = userRole === 'student' ? app_id.trim() : null;

    const [result] = await pool.execute(
      'INSERT INTO users (username, password, app_id, role) VALUES (?, ?, ?, ?)',
      [username, hashed, cleanAppId, userRole]
    );

    // Log action
    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'added user', username]
    );

    return res.json({ success: true, data: { id: result.insertId, username, role: userRole } });
  } catch (err) {
    console.error('Add user error:', err);
    return res.status(500).json({ success: false, message: 'Failed to add user' });
  }
};

// POST /admin/users/upload — bulk upload students via CSV
// CSV format: name,app_id (one per line, with or without header)
exports.bulkUploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded' });
    }

    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());

    if (lines.length === 0) {
      return res.status(400).json({ success: false, message: 'CSV file is empty' });
    }

    // Skip header if it looks like one
    let startIdx = 0;
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('name') || firstLine.includes('app_id') || firstLine.includes('app id')) {
      startIdx = 1;
    }

    let added = 0;
    let skipped = 0;
    const errors = [];

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      const name = parts[0];
      const appId = parts[1];

      if (!name || !appId) {
        errors.push(`Row ${i + 1}: missing name or app_id`);
        skipped++;
        continue;
      }

      // Check duplicate app_id
      const [existingAppId] = await pool.execute('SELECT id FROM users WHERE app_id = ?', [appId]);
      if (existingAppId.length > 0) {
        errors.push(`Row ${i + 1}: App ID "${appId}" already exists`);
        skipped++;
        continue;
      }

      // Check duplicate username
      const [existingName] = await pool.execute('SELECT id FROM users WHERE username = ?', [name]);
      if (existingName.length > 0) {
        errors.push(`Row ${i + 1}: Name "${name}" already exists`);
        skipped++;
        continue;
      }

      await pool.execute(
        "INSERT INTO users (username, password, app_id, role) VALUES (?, NULL, ?, 'student')",
        [name, appId]
      );
      added++;
    }

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'bulk uploaded students', `${added} added, ${skipped} skipped`]
    );

    return res.json({
      success: true,
      data: { added, skipped, errors: errors.slice(0, 20) }
    });
  } catch (err) {
    console.error('Bulk upload error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process CSV' });
  }
};

// DELETE /admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const currentUser = req.session.user;

    // Cannot delete yourself
    if (targetId === currentUser.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const [rows] = await pool.execute('SELECT username FROM users WHERE id = ?', [targetId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const targetUsername = rows[0].username;
    await pool.execute('DELETE FROM users WHERE id = ?', [targetId]);

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [currentUser.id, 'deleted user', targetUsername]
    );

    return res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

// GET /admin/logs?page=1&per_page=25&user=...&action=...
exports.getLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(10, parseInt(req.query.per_page, 10) || 25));
    const offset = (page - 1) * perPage;

    const filters = [];
    const params = [];
    if (req.query.user) {
      filters.push('u.username LIKE ?');
      params.push(`%${req.query.user}%`);
    }
    if (req.query.action) {
      filters.push('al.action LIKE ?');
      params.push(`%${req.query.action}%`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM activity_log al
       LEFT JOIN users u ON al.user_id = u.id
       ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT al.*, u.username FROM activity_log al
       LEFT JOIN users u ON al.user_id = u.id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.max(1, Math.ceil(total / perPage))
      }
    });
  } catch (err) {
    console.error('Get logs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
};

// GET /admin/reports — analytics data
exports.getReports = async (req, res) => {
  try {
    // Total files
    const [totalFiles] = await pool.execute('SELECT COUNT(*) AS count FROM uploaded_files');

    // Files this month
    const [monthFiles] = await pool.execute(
      "SELECT COUNT(*) AS count FROM uploaded_files WHERE uploaded_at >= DATE_FORMAT(NOW(), '%Y-%m-01')"
    );

    // Total storage
    const [totalStorage] = await pool.execute('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM uploaded_files');

    // Files by type
    const [byType] = await pool.execute(`
      SELECT
        CASE
          WHEN mime_type LIKE 'image/%' THEN 'Images'
          WHEN mime_type LIKE 'video/%' THEN 'Videos'
          WHEN mime_type = 'application/pdf' THEN 'PDFs'
          WHEN mime_type LIKE 'text/%' OR mime_type LIKE 'application/msword%' OR mime_type LIKE 'application/vnd.openxmlformats%' THEN 'Documents'
          ELSE 'Other'
        END AS type_group,
        COUNT(*) AS count
      FROM uploaded_files GROUP BY type_group
    `);

    // Top uploaders
    const [topUploaders] = await pool.execute(`
      SELECT u.username, COUNT(f.id) AS count
      FROM uploaded_files f JOIN users u ON f.uploaded_by = u.id
      GROUP BY f.uploaded_by ORDER BY count DESC LIMIT 10
    `);

    // Files per category
    const [byCategory] = await pool.execute(`
      SELECT COALESCE(c.name, 'Uncategorized') AS category, COUNT(f.id) AS count
      FROM uploaded_files f LEFT JOIN categories c ON f.category_id = c.id
      GROUP BY f.category_id ORDER BY count DESC
    `);

    // Recent activity
    const [recentActivity] = await pool.execute(`
      SELECT al.*, u.username FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC LIMIT 20
    `);

    return res.json({
      success: true,
      data: {
        totalFiles: totalFiles[0].count,
        monthFiles: monthFiles[0].count,
        totalStorage: totalStorage[0].total,
        byType,
        topUploaders,
        byCategory,
        recentActivity
      }
    });
  } catch (err) {
    console.error('Reports error:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate reports' });
  }
};
