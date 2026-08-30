/**
 * Typed HTTP errors so the central Express error middleware can set status
 * without each controller repeating res.status().json() patterns.
 */
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
}

function notFound(message = "Not found") {
  return new HttpError(404, message);
}

function badRequest(message) {
  return new HttpError(400, message);
}

function serviceUnavailable(message) {
  return new HttpError(503, message);
}

function gone(message) {
  return new HttpError(410, message);
}

module.exports = {
  HttpError,
  notFound,
  badRequest,
  serviceUnavailable,
  gone,
};
