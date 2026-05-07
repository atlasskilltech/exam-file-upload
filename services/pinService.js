// Deterministic, time-rotating exam PIN generator.
// PIN = first 6 digits of HMAC-SHA256(pin_secret, bucket-index), recomputed
// each 10-minute window. Cluster workers all derive the same value with no
// shared state, so no cron or DB write is needed to rotate.
const crypto = require('crypto');

const PIN_WINDOW_MS = 10 * 60 * 1000;
const PIN_LENGTH = 6;

function getBucket(now = Date.now()) {
  const index = Math.floor(now / PIN_WINDOW_MS);
  const startsAt = index * PIN_WINDOW_MS;
  const expiresAt = startsAt + PIN_WINDOW_MS;
  return { index, startsAt, expiresAt, secondsRemaining: Math.ceil((expiresAt - now) / 1000) };
}

function generateSecret() {
  return crypto.randomBytes(24).toString('hex');
}

function pinFromSecret(secret, bucketIndex) {
  const mac = crypto.createHmac('sha256', String(secret)).update(String(bucketIndex)).digest();
  // Use a 4-byte slice as an unsigned int, mod 10^PIN_LENGTH, zero-padded.
  const num = mac.readUInt32BE(0) % (10 ** PIN_LENGTH);
  return String(num).padStart(PIN_LENGTH, '0');
}

function currentPin(secret, now = Date.now()) {
  const bucket = getBucket(now);
  return { pin: pinFromSecret(secret, bucket.index), ...bucket };
}

// Accept the current bucket's PIN, plus a small grace window so a student
// who fetches the PIN at 9:59 can still log in at 10:00 without a hiccup.
function verifyPin(secret, candidate, now = Date.now()) {
  if (!secret || !candidate) return false;
  const trimmed = String(candidate).trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const current = getBucket(now);
  const previous = current.index - 1;
  return trimmed === pinFromSecret(secret, current.index) ||
         trimmed === pinFromSecret(secret, previous);
}

module.exports = {
  PIN_WINDOW_MS,
  PIN_LENGTH,
  generateSecret,
  currentPin,
  verifyPin
};
