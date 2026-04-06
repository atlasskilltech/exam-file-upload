// Auth controller — login, logout, session check logic
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// POST /auth/login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    // Look up user by username
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const user = rows[0];

    // Compare password with bcrypt hash
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Store user info in session
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    // Log the login action
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
