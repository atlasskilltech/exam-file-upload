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

    // Read-only match against every assigned exam. Login MUST NOT rotate
    // the PIN — that's the admin endpoint's job. We return distinct messages
    // for the three failure cases so admins can debug assignment issues
    // without resorting to SQL.
    const candidate = String(pin).trim();
    const [assignments] = await pool.execute(`
      SELECT e.id, e.title, e.status, e.current_pin, e.pin_generated_at
      FROM exams e
      INNER JOIN exam_students es ON es.exam_id = e.id AND es.student_id = ?
    `, [user.id]);

    console.log(`[student-login] app_id=${user.app_id} typed_pin=${candidate} ` +
      `assignments=${assignments.length} ` +
      `details=${JSON.stringify(assignments.map(a => ({
        id: a.id, status: a.status, current_pin: a.current_pin
      })))}`);

    if (assignments.length === 0) {
      return res.status(401).json({ success: false,
        message: 'Your App ID is not assigned to any exam. Contact your admin.' });
    }

    const active = assignments.filter(a => a.status === 'active');
    if (active.length === 0) {
      return res.status(401).json({ success: false,
        message: 'All exams assigned to you are closed.' });
    }

    const matched = active.find(a => a.current_pin === candidate);
    if (!matched) {
      const hasPin = active.some(a => a.current_pin);
      return res.status(401).json({ success: false,
        message: hasPin
          ? 'PIN does not match. It may have just rotated — ask admin to reshow it.'
          : 'Exam PIN has not been generated yet. Ask admin to open the PIN modal.' });
    }

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
