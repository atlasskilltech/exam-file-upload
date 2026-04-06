// ================================================================
// LocalVault — Main Express Server
// ================================================================

// Set Node.js timezone to IST
process.env.TZ = 'Asia/Kolkata';

const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Body parsers ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session configuration ─────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ── Static files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Import routes ─────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const examRoutes = require('./routes/examRoutes');

// ── Mount routes ──────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/files', fileRoutes);
app.use('/categories', categoryRoutes);
app.use('/admin', adminRoutes);
app.use('/exams', examRoutes);

// ── Root redirects to login page ──────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large. Max size is ' + process.env.MAX_FILE_SIZE_MB + 'MB.' });
  }
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`LocalVault running at http://localhost:${PORT}`);
});
