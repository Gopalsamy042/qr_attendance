/**
 * Express bootstrap: middleware, routes, and a single error handler.
 * Keep this file thin so interview walkthroughs start at routes → controllers → services.
 */
require("dotenv").config();

const path = require("path");
const express = require("express");
const sessionRoutes = require("./routes/sessionRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const cookieParser = require("cookie-parser");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Use a secret for signing cookies (fallback for local dev)
app.use(cookieParser(process.env.COOKIE_SECRET || "qr-attendance-super-secret"));
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/session/new");
});

app.use(sessionRoutes);
app.use(attendanceRoutes);

app.use((req, res) => {
  const message = "Not found";
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: message });
  }
  return res.status(404).render("mark-attendance", {
    mode: "error",
    title: "Not found",
    message,
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.statusCode || 500;
  const message =
    status === 500
      ? "Something went wrong. Please try again."
      : err.message || "Request failed";

  if (status >= 500) {
    console.error("[error]", err);
  }

  const wantsJson =
    req.path.startsWith("/api/") ||
    (req.get("Accept") || "").includes("application/json");

  if (wantsJson) {
    return res.status(status).json({ error: message, code: err.code });
  }

  const mode =
    err.code === "SESSION_ENDED"
      ? "ended"
      : err.code === "TOKEN_EXPIRED"
        ? "expired"
        : "error";

  return res.status(status).render("mark-attendance", {
    mode,
    title:
      mode === "ended"
        ? "Session ended"
        : mode === "expired"
          ? "QR code expired"
          : "Could not complete request",
    message,
  });
});

// Export for Vercel serverless
module.exports = app;

// Only listen when running locally (not on Vercel)
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`QR attendance running on http://localhost:${PORT}`);
  });
}
