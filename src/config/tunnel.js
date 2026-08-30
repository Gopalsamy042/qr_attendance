/**
 * Tunnel module: Exposes the local server to the internet using localtunnel.
 * This gives a public URL so students on ANY network (mobile data, different Wi-Fi)
 * can scan the QR code and mark attendance.
 */
const localtunnel = require("localtunnel");

let tunnelUrl = null;
let tunnelInstance = null;

async function startTunnel(port) {
  try {
    tunnelInstance = await localtunnel({ port });
    tunnelUrl = tunnelInstance.url;

    console.log(`\n==============================================`);
    console.log(`  PUBLIC URL: ${tunnelUrl}`);
    console.log(`  Share this or project the QR — works on ANY network!`);
    console.log(`==============================================\n`);

    tunnelInstance.on("close", () => {
      console.log("[tunnel] Tunnel closed");
      tunnelUrl = null;
    });

    tunnelInstance.on("error", (err) => {
      console.error("[tunnel] Error:", err.message);
    });

    return tunnelUrl;
  } catch (err) {
    console.error("[tunnel] Failed to start tunnel:", err.message);
    console.log("[tunnel] Falling back to local network IP for QR codes.");
    return null;
  }
}

function getTunnelUrl() {
  return tunnelUrl;
}

function closeTunnel() {
  if (tunnelInstance) {
    tunnelInstance.close();
    tunnelInstance = null;
    tunnelUrl = null;
  }
}

module.exports = { startTunnel, getTunnelUrl, closeTunnel };
