// Simple per-exam PIN: a 6-digit random number stored in the DB.
// Rotation happens server-side every 10 minutes via an atomic UPDATE
// guarded by a freshness check. Whatever value is in the row is the
// only valid PIN — comparison at login is a plain string equality, so
// clock skew between client and server cannot cause spurious failures.
const crypto = require('crypto');
const pool = require('../config/db');

const PIN_WINDOW_MS = 10 * 60 * 1000;
const PIN_LENGTH = 6;

function randomPin() {
  // crypto.randomInt is unbiased over the full range, unlike Math.random.
  return String(crypto.randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
}

// Returns the current PIN for an exam, rotating it if older than the window.
// The UPDATE is conditional, so concurrent workers serialize on the row lock
// and only one of them actually rotates. Returns null if exam doesn't exist.
async function getOrRotatePin(examId) {
  const candidate = randomPin();
  await pool.execute(
    `UPDATE exams
     SET current_pin = ?, pin_generated_at = NOW()
     WHERE id = ?
       AND (current_pin IS NULL
            OR pin_generated_at IS NULL
            OR pin_generated_at < NOW() - INTERVAL ? SECOND)`,
    [candidate, examId, PIN_WINDOW_MS / 1000]
  );

  const [rows] = await pool.execute(
    'SELECT current_pin, pin_generated_at FROM exams WHERE id = ?',
    [examId]
  );
  if (rows.length === 0) return null;

  const generatedAt = rows[0].pin_generated_at ? new Date(rows[0].pin_generated_at).getTime() : Date.now();
  const expiresAt = generatedAt + PIN_WINDOW_MS;
  return {
    pin: rows[0].current_pin,
    generatedAt,
    expiresAt,
    secondsRemaining: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
  };
}

module.exports = {
  PIN_WINDOW_MS,
  PIN_LENGTH,
  randomPin,
  getOrRotatePin
};
