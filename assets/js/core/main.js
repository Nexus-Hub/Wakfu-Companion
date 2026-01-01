// ==========================================
// MAIN.JS - EVENT MANAGER & ENTRY POINT
// ==========================================

// --- GLOBAL DOM ELEMENTS ---
const setupPanel = document.getElementById("setup-panel");
const dropZone = document.getElementById("drop-zone");
const activeFilename = document.getElementById("active-filename");
const liveIndicator = document.getElementById("live-indicator");
const chatList = document.getElementById("chat-list");
const autoResetBtn = document.getElementById("autoResetToggle");
const autoResetText = document.getElementById("autoResetText");
const clearChatBtn = document.getElementById("clearChatBtn");

// Reconnect Elements
const reconnectContainer = document.getElementById("reconnect-container");
const reconnectBtn = document.getElementById("reconnect-btn");
const newFileBtn = document.getElementById("new-file-btn");
const prevFilenameEl = document.getElementById("prev-filename");

// Copy Button
const copyPathBtn = document.getElementById("copy-path-btn");
const logPathEl = document.getElementById("log-path");

// Item Tracker Elements
const profSelect = document.getElementById("prof-select");
const itemInput = document.getElementById("item-input");
const itemDatalist = document.getElementById("item-datalist");
const trackerList = document.getElementById("tracker-list");

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Core Logic & State Restoration
  checkPreviousFile(); // filesystem.js
  loadFightHistory(); // combat.js
  initForecast(); // forecast.js

  // 2. Data Preparation
  initMonsterDatabase(); // combat.js
  generateSpellMap(); // combat.js
  initTrackerDropdowns(); // tracker.js

  // 3. UI Rendering
  renderMeter(); // ui.js
  setupDragAndDrop(); // ui.js
  updateDailyTimer(); // ui.js
  updateWatchdogUI(); // ui.js

  // 4. Background Tasks
  setInterval(updateDailyTimer, 60000);

  // 5. Draggable Windows
  const qtWindow = document.getElementById("quick-trans-modal");
  const qtHandle = document.getElementById("qt-drag-handle");
  if (qtWindow && qtHandle) {
    makeDraggable(qtWindow, qtHandle); // utils.js
  }
});

// --- EVENT LISTENERS ---

// 1. File Drop Logic
dropZone.addEventListener("dragover", (e) => e.preventDefault());
dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  const items = e.dataTransfer.items;

  if (items && items[0] && items[0].kind === "file") {
    try {
      const handle = await items[0].getAsFileSystemHandle();
      const fileName = handle.name.toLowerCase();

      // STRICT CHECK: Only allow the specific log file
      if (fileName !== "wakfu_chat.log") {
        alert("❌ Incorrect file.\nPlease only drop 'wakfu_chat.log'.");
        return;
      }

      // If valid, start tracking
      fileHandle = handle;
      await startTracking(fileHandle); // parser.js
    } catch (err) {
      console.error(err);
      alert("Error reading file. Please try again.");
    }
  }
});

// 2. Reconnect Button Logic
if (reconnectBtn) {
  reconnectBtn.addEventListener("click", async () => {
    const handle = await getSavedHandle(); // filesystem.js
    if (handle) {
      const opts = { mode: "read" };
      try {
        if (
          (await handle.queryPermission(opts)) === "granted" ||
          (await handle.requestPermission(opts)) === "granted"
        ) {
          fileHandle = handle;
          await startTracking(fileHandle); // parser.js
        } else {
          alert("Permission denied. Please select the file again.");
          reconnectContainer.style.display = "none";
          dropZone.style.display = "block";
        }
      } catch (e) {
        console.error("Permission error:", e);
        reconnectContainer.style.display = "none";
        dropZone.style.display = "block";
      }
    }
  });
}

// 3. New File Button
if (newFileBtn) {
  newFileBtn.addEventListener("click", () => {
    reconnectContainer.style.display = "none";
    dropZone.style.display = "block";
  });
}

// 4. Copy Path Logic
if (copyPathBtn && logPathEl) {
  copyPathBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(logPathEl.textContent).then(() => {
      const originalText = copyPathBtn.textContent;
      copyPathBtn.textContent = "COPIED!";
      copyPathBtn.style.background = "var(--accent, #00e1ff)";
      copyPathBtn.style.color = "#000";

      setTimeout(() => {
        copyPathBtn.textContent = originalText;
        copyPathBtn.style.background = "#444";
        copyPathBtn.style.color = "#fff";
      }, 1500);
    });
  });
}

// 5. Chat Clear
clearChatBtn.addEventListener("click", () => {
  chatList.innerHTML = '<div class="empty-state">Chat cleared</div>';
});

// 6. Watchdog Toggle
autoResetBtn.addEventListener("click", () => {
  isAutoResetOn = !isAutoResetOn;
  localStorage.setItem("wakfu_auto_reset", isAutoResetOn);
  autoResetBtn.classList.toggle("active", isAutoResetOn);
  updateWatchdogUI(); // ui.js
});
