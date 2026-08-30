/**
 * Teacher dashboard client: polls QR (5s) and attendance (4s).
 * Countdown is local so the projected timer stays smooth between polls.
 */
(function () {
  const cfg = window.DASHBOARD;
  if (!cfg || !cfg.sessionId) return;

  const qrImage = document.getElementById("qr-image");
  const qrError = document.getElementById("qr-error");
  const countdownEl = document.getElementById("qr-countdown");
  const countEl = document.getElementById("present-count");
  const tbody = document.getElementById("attendance-body");
  const emptyNote = document.getElementById("empty-note");
  const endBtn = document.getElementById("end-session");
  const statusEl = document.getElementById("session-status");

  let secondsLeft = 0;
  let ended = cfg.status !== "ACTIVE";

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  async function refreshQr() {
    if (ended) return;
    try {
      const res = await fetch(`/api/sessions/${cfg.sessionId}/current-qr`);
      const data = await res.json();
      if (!res.ok) {
        qrError.textContent = data.message || data.error || "Could not load QR";
        qrError.classList.remove("hidden");
        if (res.status === 410) {
          ended = true;
        }
        return;
      }
      qrError.classList.add("hidden");
      qrImage.src = data.qrImageDataUrl;
      secondsLeft = Number(data.expiresInSeconds) || 0;
      countdownEl.textContent = String(secondsLeft);
    } catch (err) {
      qrError.textContent = "Network error while loading QR";
      qrError.classList.remove("hidden");
    }
  }

  async function refreshAttendance() {
    try {
      const res = await fetch(`/api/sessions/${cfg.sessionId}/attendance`);
      const data = await res.json();
      if (!res.ok) return;
      countEl.textContent = String(data.count);
      tbody.innerHTML = data.students
        .map(
          (s) =>
            `<tr class="table-row-hover transition-colors"><td class="px-4 py-4 font-mono text-indigo-300">${escapeHtml(s.rollNumber)}</td><td class="px-4 py-4 font-medium text-white">${escapeHtml(
              s.name
            )}</td><td class="px-4 py-4 text-slate-400">${escapeHtml(formatTime(s.markedAt))}</td></tr>`
        )
        .join("");
      if (emptyNote) {
        emptyNote.style.display = data.count ? "none" : "block";
      }
    } catch {
      /* keep last good table if a poll fails */
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  setInterval(() => {
    if (ended || secondsLeft <= 0) return;
    secondsLeft -= 1;
    countdownEl.textContent = String(secondsLeft);
  }, 1000);

  if (!ended) {
    refreshQr();
    setInterval(refreshQr, 5000);
  }

  refreshAttendance();
  setInterval(refreshAttendance, 4000);

  if (endBtn) {
    endBtn.addEventListener("click", async () => {
      if (!confirm("End this session? Students will no longer be able to mark attendance.")) {
        return;
      }
      const res = await fetch(`/api/sessions/${cfg.sessionId}/end`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        ended = true;
        statusEl.textContent = "ENDED";
        statusEl.className = "px-2 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30";
        endBtn.remove();
        qrError.textContent = "Session ended. QR rotation has stopped.";
        qrError.classList.remove("hidden");
      }
    });
  }
})();
