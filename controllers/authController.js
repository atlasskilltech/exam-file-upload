// Auth controller — login, logout, session check logic
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const pinService = require('../services/pinService');
const activityLog = require('../services/activityLog');

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

    await activityLog.log(req, 'logged in', user.username, { userId: user.id });

    return res.json({ success: true, data: { username: user.username, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// POST /auth/student-login — student login with app_id + rotating exam PIN.
// PIN must match an exam the student is assigned to that is currently in a
// live time slot. PIN rotates every 10 minutes (see services/pinService.js).
exports.studentLogin = async (req, res) => {
  try {
    const { app_id, pin } = req.body;

    if (!app_id) {
      return res.status(400).json({ success: false, message: 'App ID is required' });
    }
    if (!pin) {
      return res.status(400).json({ success: false, message: 'Exam PIN is required' });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE app_id = ? AND role = 'student'",
      [app_id.trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid App ID' });
    }

    const user = rows[0];

    // The PIN itself is the per-exam access credential the admin distributes,
    // so we match purely on PIN against any active exam — no pre-assignment
    // required. On a successful match we auto-attach the student to that
    // exam so it appears on their dashboard. Read-only on current_pin: we
    // never rotate during login (that's the admin endpoint's job).
    const candidate = String(pin).trim();
    const [matches] = await pool.execute(`
      SELECT id, title, current_pin
      FROM exams
      WHERE status = 'active'
        AND current_pin = ?
      LIMIT 1
    `, [candidate]);

    if (matches.length === 0) {
      const [diag] = await pool.execute(
        "SELECT id, title, status, current_pin FROM exams WHERE status = 'active'"
      );
      console.log(`[student-login] no PIN match. app_id=${user.app_id} typed=${candidate} active_exams=${JSON.stringify(diag)}`);

      const anyPin = diag.some(e => e.current_pin);
      return res.status(401).json({
        success: false,
        message: anyPin
          ? 'PIN does not match any active exam. It may have just rotated — ask admin to reshow it.'
          : 'No exam PIN has been generated yet. Ask admin to open the PIN modal.'
      });
    }

    const matched = matches[0];

    // Auto-assign if not already assigned. INSERT IGNORE relies on the
    // unique key (exam_id, student_id) defined in setup.sql.
    await pool.execute(
      'INSERT IGNORE INTO exam_students (exam_id, student_id) VALUES (?, ?)',
      [matched.id, user.id]
    );

    req.session.user = {
      id: user.id,
      username: user.username,
      app_id: user.app_id,
      role: user.role
    };

    await activityLog.log(req, 'logged in (app_id+pin)',
      `${user.app_id} exam:${matched.id}`, { userId: user.id });

    return res.json({ success: true, data: { username: user.username, app_id: user.app_id, role: user.role } });
  } catch (err) {
    console.error('Student login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// GET /auth/logout
exports.logout = async (req, res) => {
  const user = req.session?.user;
  if (user) {
    await activityLog.log(req, 'logged out', user.username || user.app_id || null,
      { userId: user.id });
  }
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
