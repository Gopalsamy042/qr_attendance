/**
 * QR token lifecycle: Redis is the source of truth for "what is currently
 * scannable". We generate lazily on GET (driven by the dashboard poll),
 * never with a server-side setInterval, so idle sessions do not spin work.
 */
const crypto = require("crypto");
const QRCode = require("qrcode");
const redis = require("../config/redis");
const { serviceUnavailable } = require("../utils/httpError");

const REFRESH_IF_REMAINING_MS = 3000;

function tokenKey(sessionId) {
  return `session:${sessionId}:token`;
}

function ttlSeconds() {
  return Number(process.env.QR_TOKEN_TTL_SECONDS) || 25;
}

async function runRedis(operation) {
  try {
    return await operation();
  } catch (err) {
    console.error("[qrService] Redis failed:", err.message);
    throw serviceUnavailable(
      "Attendance QR service is temporarily unavailable (Redis). Please retry shortly."
    );
  }
}

/**
 * Reads the live token. Mark-attendance must always call this rather than
 * trusting a token that was valid when the form was first rendered.
 */
async function getStoredToken(sessionId) {
  return runRedis(() => redis.get(tokenKey(sessionId)));
}

/**
 * Creates or reuses a token, then renders it as a PNG data URL.
 * Reuse when TTL remaining > 3s so a 5s poll does not rotate early
 * and invalidate a student who is mid-scan.
 */
async function getOrRotateQr(sessionId, baseUrl) {
  const key = tokenKey(sessionId);

  const remainingMs = await runRedis(() => redis.pttl(key));
  let token;

  if (remainingMs > REFRESH_IF_REMAINING_MS) {
    token = await runRedis(() => redis.get(key));
  }

  if (!token) {
    // 6 bytes → 12 hex chars: short enough for a dense QR, hard to guess.
    token = crypto.randomBytes(6).toString("hex");
    await runRedis(() => redis.set(key, token, "EX", ttlSeconds()));
  }

  const remainingAfter = await runRedis(() => redis.pttl(key));
  const expiresInSeconds = Math.max(1, Math.ceil(remainingAfter / 1000));

  const markUrl = `${baseUrl}/mark?session=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;
  const qrImageDataUrl = await QRCode.toDataURL(markUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
  });

  return { qrImageDataUrl, expiresInSeconds, markUrl };
}

async function deleteSessionToken(sessionId) {
  try {
    await redis.del(tokenKey(sessionId));
  } catch (err) {
    console.error("[qrService] failed to delete token:", err.message);
  }
}

module.exports = {
  getStoredToken,
  getOrRotateQr,
  deleteSessionToken,
};
