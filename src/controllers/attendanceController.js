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

  const result = await attendanceService.markAttendance({
    sessionId: req.body.sessionId,
    token: req.body.token,
    studentId: req.body.studentId,
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
