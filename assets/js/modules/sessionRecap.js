// ==========================================
// SESSION RECAP MODULE
// Handles parsing and tracking of session statistics
// ==========================================

let sessionStats = {
  kamas: { earned: 0, spent: 0 },
  quests: 0,
  challenges: 0,
  xp: {
    Combat: 0,
    // Professions
    Armorer: 0,
    Baker: 0,
    Chef: 0,
    Handyman: 0,
    Jeweler: 0,
    "Leather Dealer": 0,
    Tailor: 0,
    "Weapons Master": 0,
    Farmer: 0,
    Fisherman: 0,
    Herbalist: 0,
    Lumberjack: 0,
    Miner: 0,
    Trapper: 0,
  },
};

let sessionStartTime = null;
let sessionTimerInterval = null;

// Regex Patterns (Multilingual support)
const REGEX_KAMAS =
  /(?:won|earned|gained|gagné|ganado|ganhou|spent|lost|perdu|perdio|gasto|gastou)\s+([\d\s.,\u00A0]+)\s+kamas/i;
const REGEX_XP =
  /(?:won|earned|gained|gagné|ganado|ganhou|\+)\s*([\d\s.,\u00A0]+)\s*xp/i;
// UPDATED: Added "won the quest"
const REGEX_QUEST =
  /(?:quest finished|quest completed|completed the quest|finished the quest|won the quest|quête terminée|terminé la quête|misión cumplida|completado la misión|missão cumprida|completou a missão)/i;
const REGEX_CHALLENGE =
  /(?:completed the challenge|challenge réussi|défi réussi|desafío conseguido|desafio concluído)/i;

/**
 * Loads data from LocalStorage on init
 */
function loadSessionData() {
  const stored = localStorage.getItem("wakfu_session_stats");
  const storedTime = localStorage.getItem("wakfu_session_start");

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      sessionStats.kamas = { ...sessionStats.kamas, ...parsed.kamas };
      sessionStats.quests = parsed.quests || 0;
      sessionStats.challenges = parsed.challenges || 0;

      if (parsed.xp) {
        for (const key in parsed.xp) {
          if (
            key === "Weapon Master" &&
            sessionStats.xp["Weapons Master"] !== undefined
          ) {
            sessionStats.xp["Weapons Master"] += parsed.xp[key];
          } else if (sessionStats.xp[key] !== undefined) {
            sessionStats.xp[key] = parsed.xp[key];
          }
        }
      }
    } catch (e) {
      console.error("Failed to load session stats", e);
    }
  }

  if (storedTime) {
    sessionStartTime = parseInt(storedTime, 10);
  }
}

/**
 * Saves current state to LocalStorage
 */
function saveSessionData() {
  localStorage.setItem("wakfu_session_stats", JSON.stringify(sessionStats));
  if (sessionStartTime) {
    localStorage.setItem("wakfu_session_start", sessionStartTime.toString());
  } else {
    localStorage.removeItem("wakfu_session_start");
  }
}

/**
 * Main hook called by the file parser
 */
function processSessionLog(line) {
  if (!line) return;
  const lower = line.toLowerCase();
  let statChanged = false;

  // 1. Kamas Logic
  const kamaMatch = line.match(REGEX_KAMAS);
  if (kamaMatch) {
    const amount = parseInt(kamaMatch[1].replace(/[\s.,\u00A0]/g, ""), 10);
    if (!isNaN(amount)) {
      if (
        lower.includes("spent") ||
        lower.includes("lost") ||
        lower.includes("perdu") ||
        lower.includes("perdio") ||
        lower.includes("gasto")
      ) {
        sessionStats.kamas.spent += amount;
      } else {
        sessionStats.kamas.earned += amount;
      }
      statChanged = true;
    }
  }

  // 2. XP Logic
  const xpMatch = line.match(REGEX_XP);
  if (xpMatch) {
    const amount = parseInt(xpMatch[1].replace(/[\s.,\u00A0]/g, ""), 10);
    if (!isNaN(amount)) {
      let category = "Combat";

      const knownProfs = Object.keys(sessionStats.xp).filter(
        (k) => k !== "Combat"
      );
      for (const prof of knownProfs) {
        if (new RegExp(`${prof}:`, "i").test(line)) {
          category = prof;
          break;
        }
      }

      if (sessionStats.xp[category] === undefined)
        sessionStats.xp[category] = 0;
      sessionStats.xp[category] += amount;
      statChanged = true;
    }
  }

  // 3. Quest Logic
  if (REGEX_QUEST.test(lower)) {
    sessionStats.quests++;
    statChanged = true;
  }

  // 4. Challenge Logic
  if (REGEX_CHALLENGE.test(lower)) {
    sessionStats.challenges++;
    statChanged = true;
  }

  // Start timer/Save if changed
  if (statChanged) {
    if (sessionStartTime === null) {
      startSessionTimer();
    }
    updateSessionUI();
    saveSessionData();
  }
}

function startSessionTimer() {
  if (sessionStartTime === null) {
    sessionStartTime = Date.now();
    localStorage.setItem("wakfu_session_start", sessionStartTime.toString());
  }
  updateCurrentSessionDuration();
}

function updateSessionUI() {
  const elEarned = document.getElementById("sess-kamas-earned");
  if (!elEarned) return;

  // Kamas
  elEarned.textContent = sessionStats.kamas.earned.toLocaleString() + " ₭";
  elEarned.className = "stat-val gold";

  document.getElementById("sess-kamas-spent").textContent =
    sessionStats.kamas.spent.toLocaleString() + " ₭";

  const net = sessionStats.kamas.earned - sessionStats.kamas.spent;
  const elNet = document.getElementById("sess-kamas-net");
  elNet.textContent = (net > 0 ? "+" : "") + net.toLocaleString() + " ₭";
  elNet.className = "stat-val " + (net >= 0 ? "positive" : "negative");

  // Quests
  document.getElementById("sess-quests-count").textContent =
    sessionStats.quests;

  // Challenges
  const elChal = document.getElementById("sess-challenges-count");
  if (elChal) elChal.textContent = sessionStats.challenges;

  // XP List
  const xpContainer = document.getElementById("session-xp-list");
  xpContainer.innerHTML = "";

  let hasXp = false;

  const categories = Object.keys(sessionStats.xp).sort((a, b) => {
    if (a === "Combat") return -1;
    if (b === "Combat") return 1;
    return a.localeCompare(b);
  });

  categories.forEach((cat) => {
    const val = sessionStats.xp[cat];
    if (val > 0) {
      hasXp = true;
      const row = document.createElement("div");
      row.className = "stat-row";

      let iconPath = "";
      let iconClass = "session-list-icon";

      if (cat === "Combat") {
        iconPath = "./assets/img/headers/combat.png";
        iconClass = "session-combat-icon";
      } else {
        let safeName = cat.toLowerCase().replace(/ /g, "_");
        if (safeName === "weapons_master") safeName = "weapon_master";
        iconPath = `./assets/img/jobs/${safeName}.png`;
      }

      row.innerHTML = `
                <div class="session-label-group">
                    <img src="${iconPath}" class="${iconClass}" onerror="this.style.display='none'">
                    <span class="stat-label">${cat}:</span>
                </div>
                <span class="stat-val text-accent">${val.toLocaleString()} XP</span>
            `;
      xpContainer.appendChild(row);
    }
  });

  if (!hasXp) {
    xpContainer.innerHTML =
      '<div class="empty-state-mini">No XP gained yet.</div>';
  }

  updateCurrentSessionDuration();
}

function updateCurrentSessionDuration() {
  const durationEl = document.getElementById("sess-current-duration");
  if (!durationEl) return;

  if (sessionStartTime === null) {
    durationEl.textContent = "00:00:00";
    return;
  }

  const elapsedMs = Date.now() - sessionStartTime;
  const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
  const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((elapsedMs % (1000 * 60)) / 1000);

  const h = hours.toString().padStart(2, "0");
  const m = minutes.toString().padStart(2, "0");
  const s = seconds.toString().padStart(2, "0");

  durationEl.textContent = `${h}:${m}:${s}`;
}

function toggleSessionWindow() {
  const win = document.getElementById("session-window");
  if (win.style.display === "none") {
    win.style.display = "flex";
    updateSessionUI();

    if (sessionTimerInterval === null) {
      updateCurrentSessionDuration();
      sessionTimerInterval = setInterval(updateCurrentSessionDuration, 1000);
    }
  } else {
    win.style.display = "none";

    if (sessionTimerInterval !== null) {
      clearInterval(sessionTimerInterval);
      sessionTimerInterval = null;
    }
  }
}

function resetSessionStats() {
  sessionStats.kamas.earned = 0;
  sessionStats.kamas.spent = 0;
  sessionStats.quests = 0;
  sessionStats.challenges = 0;
  for (const key in sessionStats.xp) {
    sessionStats.xp[key] = 0;
  }

  sessionStartTime = Date.now();
  saveSessionData();

  updateSessionUI();
  updateCurrentSessionDuration();
}

// Init
loadSessionData();

// Export
window.toggleSessionWindow = toggleSessionWindow;
window.resetSessionStats = resetSessionStats;
window.startSessionTimer = startSessionTimer;
