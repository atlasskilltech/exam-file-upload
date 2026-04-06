// Auth controller — login, logout, session check logic
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// POST /auth/login — admin/user login with username + password
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const user = rows[0];

    // Students must use app_id login, not this route
    if (user.role === 'student') {
      return res.status(400).json({ success: false, message: 'Students must login with App ID' });
    }

    if (!user.password) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      app_id: user.app_id || null,
      role: user.role
    };

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'logged in', user.username]
    );

    return res.json({ success: true, data: { username: user.username, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// POST /auth/student-login — student login with app_id only
exports.studentLogin = async (req, res) => {
  try {
    const { app_id } = req.body;

    if (!app_id) {
      return res.status(400).json({ success: false, message: 'App ID is required' });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE app_id = ? AND role = 'student'",
      [app_id.trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid App ID' });
    }

    const user = rows[0];

    req.session.user = {
      id: user.id,
      username: user.username,
      app_id: user.app_id,
      role: user.role
    };

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'logged in (app_id)', user.app_id]
    );

    return res.json({ success: true, data: { username: user.username, app_id: user.app_id, role: user.role } });
  } catch (err) {
    console.error('Student login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// GET /auth/logout
exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Logged out' });
  });
};

// GET /auth/check — frontend calls this on page load
exports.check = (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ success: true, data: req.session.user });
  }
  return res.status(401).json({ success: false, message: 'Not authenticated' });
};
