// ================================================================
// ATLAS Exam — Main Express Server (optimized for 500+ users)
// ================================================================

// Set Node.js timezone to IST
process.env.TZ = 'Asia/Kolkata';

const cluster = require('cluster');
const os = require('os');

// ── Clustering — use all CPU cores ────────────────────────────
const WORKERS = parseInt(process.env.CLUSTER_WORKERS) || Math.min(os.cpus().length, 4);

if (cluster.isPrimary && process.env.NO_CLUSTER !== '1') {
  console.log(`Primary ${process.pid} starting ${WORKERS} workers...`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  startServer();
}

function startServer() {
  const express = require('express');
  const session = require('express-session');
  const compression = require('compression');
  const path = require('path');
  require('dotenv').config();

  const app = express();
  const PORT = process.env.PORT || 3000;

  // ── Gzip compression — reduces response sizes ~10x ──────────
  app.use(compression());

  // ── Body parsers ────────────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Session configuration ───────────────────────────────────
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

  // ── Static files with caching headers ───────────────────────
  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true
  }));

  // ── Import routes ───────────────────────────────────────────
  const authRoutes = require('./routes/authRoutes');
  const fileRoutes = require('./routes/fileRoutes');
  const categoryRoutes = require('./routes/categoryRoutes');
  const adminRoutes = require('./routes/adminRoutes');
  const examRoutes = require('./routes/examRoutes');

  // ── Mount routes ────────────────────────────────────────────
  app.use('/auth', authRoutes);
  app.use('/files', fileRoutes);
  app.use('/categories', categoryRoutes);
  app.use('/admin', adminRoutes);
  app.use('/exams', examRoutes);

  // ── Root redirects to login page ────────────────────────────
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ── Global error handler ────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File too large. Max size is ' + process.env.MAX_FILE_SIZE_MB + 'MB.' });
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  });

  // ── Start server ────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`ATLAS Exam worker ${process.pid} running at http://localhost:${PORT}`);
  });
}
