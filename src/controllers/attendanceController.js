const attendanceService = require("../services/attendanceService");
const { requireFields, isUuid } = require("../utils/asyncHandler");

function renderMarkPage(res, extras) {
  res.render("mark-attendance", extras);
}

async function showMarkForm(req, res) {
  // Validate before showing the form so students never submit against a dead QR.
  const sessionId = req.query.session;
  const token = req.query.token;

  if (!sessionId || !token) {
    return renderMarkPage(res.status(400), {
      mode: "error",
      title: "Invalid QR link",
      message: "This link is missing a session or token. Scan the QR on the classroom screen.",
    });
  }

  if (!isUuid(sessionId)) {
    return renderMarkPage(res.status(404), {
      mode: "error",
      title: "Session not found",
      message: "This session does not exist.",
    });
  }

  let session;
  try {
    session = await attendanceService.getSessionOrThrow(sessionId);
  } catch (err) {
    if (err.statusCode === 404) {
      return renderMarkPage(res.status(404), {
        mode: "error",
        title: "Session not found",
        message: "This session does not exist.",
      });
    }
    throw err;
  }

  if (session.status !== "ACTIVE") {
    return renderMarkPage(res.status(410), {
      mode: "ended",
      title: "Session ended",
      message: "This session has ended. Attendance is closed.",
      className: session.className,
    });
  }

  const qrService = require("../services/qrService");
  const current = await qrService.getStoredToken(sessionId);
  if (!current || current !== token) {
    return renderMarkPage(res.status(410), {
      mode: "expired",
      title: "QR code expired",
      message:
        "This QR code has expired. Please scan the current code on the screen.",
      className: session.className,
    });
  }

  // Check device fingerprint cookie
  const cookieName = `device_marked_${sessionId}`;
  const previouslyMarkedRoll = req.signedCookies ? req.signedCookies[cookieName] : null;

  if (previouslyMarkedRoll) {
    return renderMarkPage(res, {
      mode: "already",
      title: "Already marked",
      message: "This device has already marked attendance for this session.",
      className: session.className,
      studentId: previouslyMarkedRoll,
    });
  }

  return renderMarkPage(res, {
    mode: "form",
    session,
    token,
  });
}

async function markAttendance(req, res) {
  // Re-check token in the service; this handler only maps outcomes to HTML.
  requireFields(req.body, ["sessionId", "token", "studentId"]);

  if (!isUuid(req.body.sessionId)) {
    return renderMarkPage(res.status(404), {
      mode: "error",
      title: "Session not found",
      message: "This session does not exist.",
    });
  }

  const sessionId = req.body.sessionId;
  const studentId = req.body.studentId;

  // Check device fingerprint cookie to prevent proxy marking
  const cookieName = `device_marked_${sessionId}`;
  const previouslyMarkedRoll = req.signedCookies ? req.signedCookies[cookieName] : null;

  if (previouslyMarkedRoll && previouslyMarkedRoll !== studentId) {
    return renderMarkPage(res.status(403), {
      mode: "error",
      title: "Proxy Blocked",
      message: "This device has already been used to mark attendance for a different roll number.",
    });
  }

  const result = await attendanceService.markAttendance({
    sessionId: sessionId,
    token: req.body.token,
    studentId: studentId,
    studentName: req.body.studentName,
  });

  if (result.alreadyMarked) {
    return renderMarkPage(res, {
      mode: "already",
      title: "Already marked",
      message: "You are already marked present for this session.",
      className: result.session.className,
      studentId: result.studentId,
    });
  }

  // Set secure signed cookie so this device can't mark someone else
  res.cookie(`device_marked_${sessionId}`, result.studentId, {
    signed: true,
    httpOnly: true,
    maxAge: 4 * 60 * 60 * 1000, // 4 hours
    sameSite: "lax",
  });

  return renderMarkPage(res, {
    mode: "success",
    title: "Attendance marked",
    message: `Attendance marked at ${result.attendance.markedAt.toLocaleString()} for ${result.session.className}.`,
    className: result.session.className,
    studentId: result.studentId,
    markedAt: result.attendance.markedAt,
  });
}

module.exports = {
  showMarkForm,
  markAttendance,
};
