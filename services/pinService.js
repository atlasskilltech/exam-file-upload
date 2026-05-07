// Per-exam 6-digit PIN stored directly in `exams.current_pin`. Two
// distinct callers need different behavior:
//   - Admin PIN view  -> may rotate (so the displayed PIN auto-refreshes
//                        every 10 minutes).
//   - Student login  -> read-only (must NEVER rotate, otherwise a slightly
//                        stale PIN would be replaced before the comparison
//                        runs, and the student would always see "invalid").
const crypto = require('crypto');
const pool = require('../config/db');

const PIN_WINDOW_MS = 10 * 60 * 1000;
const PIN_LENGTH = 6;

function randomPin() {
  return String(crypto.randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
}

// Atomically rotate the PIN if the stored one is stale. Concurrent workers
// serialize on the row lock and only one of them rotates; the other reads
// the freshly-rotated value. Returns null if exam doesn't exist.
async function getOrRotatePin(examId) {
  const cutoff = new Date(Date.now() - PIN_WINDOW_MS);
  await pool.execute(
    `UPDATE exams
     SET current_pin = ?, pin_generated_at = NOW()
     WHERE id = ?
       AND (current_pin IS NULL
            OR pin_generated_at IS NULL
            OR pin_generated_at < ?)`,
    [randomPin(), examId, cutoff]
  );
  return readPin(examId);
}

// Read-only fetch — never rotates. Used at login so the value the admin
// distributed remains valid until the next admin-side rotation.
async function readPin(examId) {
  const [rows] = await pool.execute(
    'SELECT current_pin, pin_generated_at FROM exams WHERE id = ?',
    [examId]
  );
  if (rows.length === 0) return null;

  const generatedAt = rows[0].pin_generated_at ? new Date(rows[0].pin_generated_at).getTime() : null;
  const expiresAt = generatedAt ? generatedAt + PIN_WINDOW_MS : null;
  return {
    pin: rows[0].current_pin,
    generatedAt,
    expiresAt,
    secondsRemaining: expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : 0
  };
}

module.exports = {
  PIN_WINDOW_MS,
  PIN_LENGTH,
  randomPin,
  getOrRotatePin,
  readPin
};
