// Admin controller — user management, logs, reports
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// GET /admin/users
exports.listUsers = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
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
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    // Check if username exists
    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    const userRole = (role === 'admin') ? 'admin' : 'user';

    const [result] = await pool.execute(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, hashed, userRole]
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

// GET /admin/logs
exports.getLogs = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT al.*, u.username FROM activity_log al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC LIMIT 200`
    );
    return res.json({ success: true, data: rows });
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
