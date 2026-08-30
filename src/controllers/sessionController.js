const attendanceService = require("../services/attendanceService");
const qrService = require("../services/qrService");
const { requireUuid, requireFields } = require("../utils/asyncHandler");

/**
 * Derive the base URL from the incoming request.
 * Works on localhost, Vercel, or any deployment — no config needed.
 */
function baseUrl(req) {
  const protocol = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}`;
}

async function showCreateForm(req, res) {
  res.render("session-create");
}

async function createSession(req, res) {
  requireFields(req.body, ["className"]);
  const session = await attendanceService.createSession(req.body.className);
  res.redirect(`/session/${session.id}/dashboard`);
}

async function showDashboard(req, res) {
  requireUuid(req.params.id, "session");
  const session = await attendanceService.getSessionOrThrow(req.params.id);
  const attendance = await attendanceService.listAttendance(session.id);
  res.render("teacher-dashboard", {
    session,
    attendance,
    rotationSeconds: Number(process.env.QR_ROTATION_SECONDS) || 20,
  });
}

/** Lazy QR: dashboard polling is what drives rotation, not a server timer. */
async function currentQr(req, res) {
  requireUuid(req.params.id, "session");
  const session = await attendanceService.getSessionOrThrow(req.params.id);

  if (session.status !== "ACTIVE") {
    return res.status(410).json({
      error: "Session ended",
      message: "This session has ended. QR codes are no longer issued.",
    });
  }

  const payload = await qrService.getOrRotateQr(session.id, baseUrl(req));
  res.json({
    qrImageDataUrl: payload.qrImageDataUrl,
    expiresInSeconds: payload.expiresInSeconds,
  });
}

async function listAttendance(req, res) {
  requireUuid(req.params.id, "session");
  const data = await attendanceService.listAttendance(req.params.id);
  res.json(data);
}

async function endSession(req, res) {
  requireUuid(req.params.id, "session");
  const session = await attendanceService.endSession(req.params.id);
  res.json({
    message: "Session ended",
    session,
  });
}

async function exportCsv(req, res) {
  requireUuid(req.params.id, "session");
  const session = await attendanceService.getSessionOrThrow(req.params.id);
  const data = await attendanceService.listAttendance(session.id);

  // json2csv@5 Parser is the API most viva answers expect for this package.
  const { Parser } = require("json2csv");
  const rows = data.students.map((s) => ({
    "Roll Number": s.rollNumber,
    Name: s.name,
    "Marked At Time": new Date(s.markedAt).toISOString(),
  }));
  const parser = new Parser({
    fields: ["Roll Number", "Name", "Marked At Time"],
  });
  const csv = parser.parse(rows);

  const safeName = session.className.replace(/[^\w-]+/g, "_");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeName}-${session.id.slice(0, 8)}.csv"`
  );
  res.send(csv);
}

module.exports = {
  showCreateForm,
  createSession,
  showDashboard,
  currentQr,
  listAttendance,
  endSession,
  exportCsv,
};
