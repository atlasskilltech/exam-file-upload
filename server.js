// ================================================================
// LocalVault — Main Express Server (optimized for 500+ users)
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
  const rateLimit = require('express-rate-limit');
  const path = require('path');
  require('dotenv').config();

  const app = express();
  const PORT = process.env.PORT || 3000;

  // ── Gzip compression — reduces response sizes ~10x ──────────
  app.use(compression());

  // ── Rate limiting — prevent abuse ───────────────────────────
  // General API: 200 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, slow down' }
  });

  // Submission uploads: 10 per minute per IP (heavy operation)
  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many uploads, please wait' }
  });

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

  // ── Apply rate limiters ─────────────────────────────────────
  app.use('/auth', apiLimiter);
  app.use('/files', apiLimiter);
  app.use('/categories', apiLimiter);
  app.use('/admin', apiLimiter);
  app.use('/exams', apiLimiter);

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

  // ── Submission upload gets stricter rate limit ──────────────
  app.use('/exams/student/*/submit', uploadLimiter);

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
    console.log(`LocalVault worker ${process.pid} running at http://localhost:${PORT}`);
  });
}
