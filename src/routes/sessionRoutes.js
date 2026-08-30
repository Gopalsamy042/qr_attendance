const express = require("express");
const sessionController = require("../controllers/sessionController");
const { wrapAsync } = require("../utils/asyncHandler");

const router = express.Router();

router.get("/session/new", wrapAsync(sessionController.showCreateForm));
router.get("/session/:id/dashboard", wrapAsync(sessionController.showDashboard));

router.post("/api/sessions", wrapAsync(sessionController.createSession));
router.get("/api/sessions/:id/current-qr", wrapAsync(sessionController.currentQr));
router.get("/api/sessions/:id/attendance", wrapAsync(sessionController.listAttendance));
router.post("/api/sessions/:id/end", wrapAsync(sessionController.endSession));
router.get("/api/sessions/:id/export", wrapAsync(sessionController.exportCsv));

module.exports = router;
