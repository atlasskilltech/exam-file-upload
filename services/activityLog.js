// Centralized activity logger. Captures user_id + IP + user-agent in addition
// to the action/target, and never throws — a failed log write must not break
// the request that triggered it.
const pool = require('../config/db');

function clientIp(req) {
  if (!req) return null;
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim().slice(0, 64);
  return (req.ip || req.connection?.remoteAddress || '').slice(0, 64) || null;
}

function userAgent(req) {
  const ua = req?.headers?.['user-agent'];
  return ua ? String(ua).slice(0, 255) : null;
}

async function log(req, action, target, opts = {}) {
  try {
    const userId = opts.userId ?? req?.session?.user?.id ?? null;
    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [userId, action, target ?? null, clientIp(req), userAgent(req)]
    );
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
}

module.exports = { log };
