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

    // Match the PIN against every active exam this student is assigned to —
    // not just the ones in a live time slot, so logins work just before /
    // after the scheduled window. The slot-time check still gates actual
    // submissions in submitAnswer. We don't tell the student which exam
    // matched, to avoid leaking assignment info.
    const [assignedExams] = await pool.execute(`
      SELECT DISTINCT e.id, e.pin_secret
      FROM exams e
      INNER JOIN exam_students es ON es.exam_id = e.id AND es.student_id = ?
      WHERE e.status = 'active'
        AND e.pin_secret IS NOT NULL
    `, [user.id]);

    if (assignedExams.length === 0) {
      return res.status(401).json({ success: false, message: 'No active exam assigned to your App ID' });
    }

    const matched = assignedExams.find(e => pinService.verifyPin(e.pin_secret, pin));
    if (!matched) {
      return res.status(401).json({ success: false, message: 'Invalid or expired PIN' });
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
