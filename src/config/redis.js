/**
 * Shared Redis connection used for rotating QR tokens.
 * ioredis reconnects automatically; we still surface failures to callers
 * so QR endpoints can return 503 instead of crashing the process.
 */
const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  // Fail fast when Redis is down so request handlers can map this to HTTP 503.
  retryStrategy(times) {
    if (times > 8) {
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on("error", (err) => {
  // Log only — throwing here would crash Express. Handlers check commands.
  console.error("[redis] connection error:", err.message);
});

redis.on("connect", () => {
  console.log("[redis] connected");
});

module.exports = redis;
