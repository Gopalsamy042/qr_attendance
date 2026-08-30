const express = require("express");
const attendanceController = require("../controllers/attendanceController");
const { wrapAsync } = require("../utils/asyncHandler");

const router = express.Router();

router.get("/mark", wrapAsync(attendanceController.showMarkForm));
router.post("/api/attendance/mark", wrapAsync(attendanceController.markAttendance));

module.exports = router;
