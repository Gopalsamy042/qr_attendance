const prisma = require("../config/db");
const { Prisma } = require("@prisma/client");
const { notFound, badRequest } = require("../utils/httpError");
const { getStoredToken, deleteSessionToken } = require("./qrService");

async function createSession(className) {
  // New sessions start ACTIVE so the dashboard can issue QR tokens immediately.
  const name = String(className).trim();
  if (!name) {
    throw badRequest("className is required");
  }

  return prisma.session.create({
    data: { className: name, status: "ACTIVE" },
  });
}

async function getSessionOrThrow(sessionId) {
  // Unknown IDs become 404 here so controllers never leak Prisma's null vs throw mix.
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw notFound("Session not found");
  }
  return session;
}

async function endSession(sessionId) {
  // Ending is idempotent so a double-click on "End session" is safe.
  const session = await getSessionOrThrow(sessionId);
  if (session.status === "ENDED") {
    return session;
  }

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { status: "ENDED", endedAt: new Date() },
  });

  // Drop the live token so a leftover QR cannot be reused after end.
  await deleteSessionToken(sessionId);
  return updated;
}

async function listAttendance(sessionId) {
  // Dashboard polls this; keep the query cheap (one session + joined students).
  await getSessionOrThrow(sessionId);

  const rows = await prisma.attendance.findMany({
    where: { sessionId },
    orderBy: { markedAt: "asc" },
    include: { student: true },
  });

  return {
    count: rows.length,
    students: rows.map((row) => ({
      rollNumber: row.studentId,
      name: row.student.name,
      markedAt: row.markedAt,
    })),
  };
}

/**
 * Token is re-checked here (not only on GET /mark) so holding the form
 * open after the QR rotates cannot mark against a stale token.
 */
async function markAttendance({ sessionId, token, studentId, studentName }) {
  const session = await getSessionOrThrow(sessionId);

  if (session.status !== "ACTIVE") {
    const err = new Error("This session has ended. Attendance is closed.");
    err.statusCode = 410;
    err.code = "SESSION_ENDED";
    throw err;
  }

  const currentToken = await getStoredToken(sessionId);
  if (!currentToken || currentToken !== token) {
    const err = new Error(
      "This QR code has expired. Please scan the current code on the screen."
    );
    err.statusCode = 410;
    err.code = "TOKEN_EXPIRED";
    throw err;
  }

  const roll = String(studentId).trim();
  if (!roll) {
    throw badRequest("studentId (roll number) is required");
  }

  const name =
    studentName && String(studentName).trim()
      ? String(studentName).trim()
      : roll;

  await prisma.student.upsert({
    where: { id: roll },
    create: { id: roll, name },
    update: studentName && String(studentName).trim() ? { name } : {},
  });

  try {
    const attendance = await prisma.attendance.create({
      data: { sessionId, studentId: roll },
    });
    return { attendance, session, alreadyMarked: false, studentId: roll, name };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { attendance: null, session, alreadyMarked: true, studentId: roll, name };
    }
    throw err;
  }
}

module.exports = {
  createSession,
  getSessionOrThrow,
  endSession,
  listAttendance,
  markAttendance,
};
