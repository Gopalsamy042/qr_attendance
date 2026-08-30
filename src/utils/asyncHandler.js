const { HttpError } = require("../utils/httpError");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function requireUuid(value, label = "id") {
  if (!isUuid(value)) {
    throw new HttpError(404, `Unknown ${label}`);
  }
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || String(v).trim() === "";
  });
  if (missing.length) {
    throw new HttpError(
      400,
      `Missing or empty field(s): ${missing.join(", ")}`
    );
  }
}

function wrapAsync(fn) {
  // Express 4 does not catch rejected promises; this forwards them to the
  // central error middleware so we never leak a raw stack to the client.
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function wantsHtml(req) {
  const accept = req.get("Accept") || "";
  return accept.includes("text/html") || req.accepts("html");
}

module.exports = {
  isUuid,
  requireUuid,
  requireFields,
  wrapAsync,
  wantsHtml,
};
