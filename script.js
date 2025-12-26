// ==========================================
// CONFIG & STATE
// ==========================================
let fileHandle,
  fileOffset = 0,
  isReading = false;
let parseIntervalId = null,
  watchdogIntervalId = null;
let pipWindow = null;
let trackerViewMode = "grid"; // Default to grid
let combatLineCache = new Set();
let logLineCache = new Set();
let allKnownSpells = new Set();
const MAX_CACHE_SIZE = 200;
let trackerDirty = false;
const MAX_CHAT_HISTORY = 200; // Limit chat DOM nodes to save memory

// 1. AUTO RESET DEFAULT (True unless user saved 'false')
const storedReset = localStorage.getItem("wakfu_auto_reset");
let isAutoResetOn = storedReset === null ? true : storedReset === "true";
let currentTrackerFilter =
  localStorage.getItem("wakfu_tracker_filter") || "SHOW_ALL";

// Global function to handle the toggle and save state
window.toggleIconVariant = function (playerName, imgEl) {
  // 1. Toggle State
  playerVariantState[playerName] = !playerVariantState[playerName];

  // 2. Get Class Name
  const className = playerClasses[playerName];
  if (!className) return;

  // 3. Update Image Source Immediately
  const newSrc = playerVariantState[playerName]
    ? `./img/classes/${className}-f.png`
    : `./img/classes/${className}.png`;
  imgEl.src = newSrc;

  // 4. Clear Cache (So the next re-render generates the correct version)
  delete playerIconCache[playerName];
};

// Helper to find elements in either the main document or the PiP document
function getUI(id) {
  if (pipWindow && pipWindow.document) {
    const pipEl = pipWindow.document.getElementById(id);
    if (pipEl) return pipEl;
  }
  return document.getElementById(id);
}

// Combat State
let fightData = {}; // Damage
let healData = {}; // Healing
let armorData = {}; // Armor
let playerClasses = {}; // Map player Name -> Class Icon Filename
let summonBindings = {}; // Map: SummonName -> MasterName
let playerIconCache = {}; // Cache for icon HTML strings to avoid re-calc
let playerVariantState = {}; // Stores true/false for gender toggle
let manualOverrides = {}; // Map player Name -> 'ally' | 'enemy'
let activeMeterMode = "damage"; // 'damage', 'healing', 'armor'
let currentCaster = "Unknown";
let currentSpell = "Unknown Spell";
let expandedPlayers = new Set();
let lastCombatTime = Date.now();
let resetDelayMs = 120000;

// Spell Map (Built at runtime)
let spellToClassMap = {};

// Chat State
const translationQueue = [];
let isTranslating = false;
const transConfig = {
  pt: true,
  fr: true,
  es: false,
  others: false,
  enabled: true,
};
let currentChatFilter = "all";

// Item Tracker State
let trackedItems = [];

// Auto Fight State
let awaitingNewFight = false;

// ELEMENTS
const setupPanel = document.getElementById("setup-panel");
const dropZone = document.getElementById("drop-zone");
const activeFilename = document.getElementById("active-filename");
const liveIndicator = document.getElementById("live-indicator");
const chatList = document.getElementById("chat-list");
const autoResetBtn = document.getElementById("autoResetToggle");
const autoResetText = document.getElementById("autoResetText");
const timerInput = document.getElementById("timerInput");
const clearChatBtn = document.getElementById("clearChatBtn");

// Setup Reconnect Elements
const reconnectContainer = document.getElementById("reconnect-container");
const reconnectBtn = document.getElementById("reconnect-btn");
const newFileBtn = document.getElementById("new-file-btn");
const prevFilenameEl = document.getElementById("prev-filename");

// Copy Button Element
const copyPathBtn = document.getElementById("copy-path-btn");
const logPathEl = document.getElementById("log-path");

// Item Tracker Elements
const profSelect = document.getElementById("prof-select");
const itemInput = document.getElementById("item-input");
const itemDatalist = document.getElementById("item-datalist");
const trackerList = document.getElementById("tracker-list");
let dragSrcIndex = null;

let activeTooltip = null;

function generateSpellMap() {
  if (typeof classSpells === "undefined") return;
  spellToClassMap = {};
  allKnownSpells = new Set();

  for (const [className, langData] of Object.entries(classSpells)) {
    // Only process keys that are actual class names (feca, iop, etc.)
    // This provides a secondary safety layer
    if (typeof langData === "object" && !Array.isArray(langData)) {
      for (const spells of Object.values(langData)) {
        if (Array.isArray(spells)) {
          spells.forEach((spell) => {
            spellToClassMap[spell] = className;
            allKnownSpells.add(spell);
          });
        }
      }
    }
  }
  console.log(
    `Class Database: ${Object.keys(classSpells).length} classes loaded.`
  );
}

function showTooltip(text, e) {
  // Determine which document we are in (Main or PiP)
  const targetDoc = e.target.ownerDocument;

  if (!activeTooltip) {
    activeTooltip = targetDoc.createElement("div");
    activeTooltip.className = "global-tooltip";
    targetDoc.body.appendChild(activeTooltip);
  }

  activeTooltip.textContent = text;
  activeTooltip.style.display = "block";

  updateTooltipPosition(e);
}

function updateTooltipPosition(e) {
  if (!activeTooltip) return;

  const gap = 15;
  let x = e.clientX + gap;
  let y = e.clientY + gap;

  // Smart bounds checking (prevent cropping)
  const tw = activeTooltip.offsetWidth;
  const th = activeTooltip.offsetHeight;
  const winW = e.target.ownerDocument.defaultView.innerWidth;
  const winH = e.target.ownerDocument.defaultView.innerHeight;

  if (x + tw > winW) x = e.clientX - tw - gap; // Flip to left
  if (y + th > winH) y = e.clientY - th - gap; // Flip to top

  activeTooltip.style.left = x + "px";
  activeTooltip.style.top = y + "px";
}

function hideTooltip() {
  if (activeTooltip) {
    activeTooltip.style.display = "none";
    // Clean up to prevent multi-window ghosting
    if (activeTooltip.parentNode)
      activeTooltip.parentNode.removeChild(activeTooltip);
    activeTooltip = null;
  }
}

let monsterLookup = {};

function initMonsterDatabase() {
  if (typeof wakfuMonsters === "undefined") return;

  monsterLookup = {};
  wakfuMonsters.forEach((m) => {
    // Map every language version of the name to the imgId
    if (m.nameEN) monsterLookup[m.nameEN.toLowerCase()] = m.imgId;
    if (m.nameFR) monsterLookup[m.nameFR.toLowerCase()] = m.imgId;
    if (m.nameES) monsterLookup[m.nameES.toLowerCase()] = m.imgId;
    if (m.namePT) monsterLookup[m.namePT.toLowerCase()] = m.imgId;
  });
}

// ==========================================
// INITIALIZATION & DRAG/DROP SETUP
// ==========================================
generateSpellMap();
renderMeter();
initTrackerDropdowns();
initMonsterDatabase();

setupDragAndDrop();

// Check for previous file immediately on load
document.addEventListener("DOMContentLoaded", () => {
  checkPreviousFile();
  initForecast(); // Initialize Forecast system
});

// MODIFIED: Drop Zone handles BOTH Log files and CSV files
dropZone.addEventListener("dragover", (e) => e.preventDefault());
dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  const items = e.dataTransfer.items;

  if (items && items[0] && items[0].kind === "file") {
    try {
      const handle = await items[0].getAsFileSystemHandle();

      // CHECK FILE TYPE
      if (handle.name.toLowerCase().endsWith(".csv")) {
        // It's the Forecast File
        const file = await handle.getFile();
        const text = await file.text();
        localStorage.setItem(FORECAST_STORAGE_KEY, text);
        parseForecastCSV(text);
        alert("✅ Forecast data updated successfully!");
      } else {
        // Assume it's the Game Log
        fileHandle = handle;
        await startTracking(fileHandle);
      }
    } catch (err) {
      console.error(err);
      alert("Error reading file. Please try again.");
    }
  }
});

// Reconnect Button Logic
if (reconnectBtn) {
  reconnectBtn.addEventListener("click", async () => {
    const handle = await getSavedHandle();
    if (handle) {
      // Browser requires permission verification on new session
      const opts = { mode: "read" };
      try {
        // queryPermission might return 'prompt' or 'granted'
        // We request it if it's not granted
        if (
          (await handle.queryPermission(opts)) === "granted" ||
          (await handle.requestPermission(opts)) === "granted"
        ) {
          fileHandle = handle;
          await startTracking(fileHandle);
        } else {
          alert("Permission denied. Please select the file again.");
          reconnectContainer.style.display = "none";
          dropZone.style.display = "block";
        }
      } catch (e) {
        console.error("Permission error:", e);
        // If the handle is stale, force new selection
        reconnectContainer.style.display = "none";
        dropZone.style.display = "block";
      }
    }
  });
}

if (newFileBtn) {
  newFileBtn.addEventListener("click", () => {
    reconnectContainer.style.display = "none";
    dropZone.style.display = "block";
  });
}

// COPY PATH LOGIC
if (copyPathBtn && logPathEl) {
  copyPathBtn.addEventListener("click", () => {
    const path = logPathEl.textContent;
    navigator.clipboard.writeText(path).then(() => {
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

function generateSpellMap() {
  if (typeof classSpells === "undefined") return;
  spellToClassMap = {};

  // Iterate over each class (e.g., "feca", "iop")
  for (const [className, langData] of Object.entries(classSpells)) {
    // Handle the new structure: Object with languages { en: [], fr: [] }
    if (typeof langData === "object" && !Array.isArray(langData)) {
      // Iterate over each language array
      for (const spells of Object.values(langData)) {
        if (Array.isArray(spells)) {
          spells.forEach((spell) => {
            spellToClassMap[spell] = className;
          });
        }
      }
    }
    // Fallback for flat structure if data is mixed (e.g. array of strings)
    else if (Array.isArray(langData)) {
      langData.forEach((spell) => {
        spellToClassMap[spell] = className;
      });
    }
  }
}

function setupDragAndDrop() {
  const alliesList = document.getElementById("list-allies");
  const enemiesList = document.getElementById("list-enemies");

  [alliesList, enemiesList].forEach((list) => {
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      list.classList.add("drag-over");
    });

    list.addEventListener("dragleave", (e) => {
      list.classList.remove("drag-over");
    });

    list.addEventListener("drop", (e) => {
      e.preventDefault();
      list.classList.remove("drag-over");
      const playerName = e.dataTransfer.getData("text/plain");
      if (!playerName) return;

      const targetType = list.id === "list-allies" ? "ally" : "enemy";

      // Set Manual Override
      manualOverrides[playerName] = targetType;
      renderMeter();
    });
  });
}

// ==========================================
// INDEXED DB (PERSISTENCE) - FIXED
// ==========================================
const DB_NAME = "WakfuNexusDB";
const DB_VERSION = 2; // Bumped version to ensure schema update if needed
const STORE_NAME = "fileHandles";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => {
      console.error("DB Error:", e);
      reject(e);
    };
  });
}

async function saveFileHandleToDB(handle) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Return a promise that resolves when the transaction completes
    return new Promise((resolve, reject) => {
      const req = store.put(handle, "activeLog");

      tx.oncomplete = () => {
        console.log("File handle saved successfully.");
        resolve();
      };

      tx.onerror = (e) => {
        console.error("Transaction failed:", e);
        reject(e);
      };

      req.onerror = (e) => {
        console.error("Put request failed:", e);
        reject(e);
      };
    });
  } catch (e) {
    console.error("Failed to save handle:", e);
  }
}

async function getSavedHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get("activeLog");

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.error("Error getting handle:", e);
    return null;
  }
}

async function checkPreviousFile() {
  const handle = await getSavedHandle();
  if (handle) {
    if (dropZone) dropZone.style.display = "none";
    if (reconnectContainer) {
      reconnectContainer.style.display = "block";
      if (prevFilenameEl) prevFilenameEl.textContent = handle.name;
    }
  }
}

// ==========================================
// ITEM TRACKER LOGIC
// ==========================================
function initTrackerDropdowns() {
  if (typeof professionItems === "undefined") return;

  const itemDatalist = document.getElementById("item-datalist");
  const itemInput = document.getElementById("item-input");
  if (!itemDatalist || !itemInput) return;

  itemInput.value = "";
  itemDatalist.innerHTML = "";

  // 1. Add all items from standard gathering professions
  for (const prof in professionItems) {
    professionItems[prof].forEach((itemData) => {
      const opt = document.createElement("option");
      opt.value = itemData.name;
      itemDatalist.appendChild(opt);
    });
  }

  // 2. Add all items from the "ALL" / items.js list
  if (typeof monsterResources !== "undefined") {
    monsterResources.forEach((itemData) => {
      const opt = document.createElement("option");
      opt.value = itemData.name;
      itemDatalist.appendChild(opt);
    });
  }

  loadTrackerState();

  // 3. RESTORE SAVED FILTER ON LOAD
  // We call this last to apply the visual filter to the loaded items
  setTrackerFilter(currentTrackerFilter);
}

function addTrackedItem() {
  const itemInput = document.getElementById("item-input");
  const itemName = itemInput.value.trim();
  if (!itemName) return alert("Type an item name first.");

  let foundItem = null;
  let category = null;

  // Search through gathering jobs
  for (const prof in professionItems) {
    const item = professionItems[prof].find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase()
    );
    if (item) {
      foundItem = item;
      category = prof;
      break;
    }
  }

  // If not found, search the monster item list
  if (!foundItem && typeof monsterResources !== "undefined") {
    const item = monsterResources.find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase()
    );
    if (item) {
      foundItem = item;
      category = "ALL";
    }
  }

  if (!foundItem) return alert(`Item "${itemName}" not found in database.`);

  // Duplication check
  if (
    trackedItems.find(
      (t) => t.name === foundItem.name && t.rarity === foundItem.rarity
    )
  ) {
    return alert("Item already on tracking list.");
  }

  const target = prompt(
    `Tracking ${foundItem.name}. Enter target quantity:`,
    "100"
  );
  if (target === null) return;

  trackedItems.push({
    id: Date.now(),
    name: foundItem.name,
    current: 0,
    target: parseInt(target) || 100,
    level: foundItem.level,
    rarity: foundItem.rarity,
    profession: category, // Saves if it's Miner, ALL, etc.
    imgId: foundItem.imgId || null,
  });

  itemInput.value = "";
  saveTrackerState();
  renderTracker();
}

// --- View Toggle ---
function toggleTrackerView() {
  trackerViewMode = trackerViewMode === "grid" ? "list" : "grid";

  // Update button icon
  const btn = document.getElementById("tracker-view-toggle");
  if (btn) btn.textContent = trackerViewMode === "grid" ? "☰" : "⊞";

  renderTracker();
}

// --- Persistence Helpers ---
function saveTrackerState() {
  localStorage.setItem("wakfu_tracker_data", JSON.stringify(trackedItems));
}

function loadTrackerState() {
  const data = localStorage.getItem("wakfu_tracker_data");
  if (data) {
    try {
      trackedItems = JSON.parse(data);
      renderTracker();
    } catch (e) {
      console.error("Error loading tracker state", e);
      trackedItems = [];
    }
  }
}

// --- Actions ---
function addTrackedItem() {
  const itemName = itemInput.value.trim();
  if (!itemName) return alert("Search for an item first.");

  let foundItem = null;
  let category = null;

  // 1. Search in Gathering Professions first
  for (const prof in professionItems) {
    const item = professionItems[prof].find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase()
    );
    if (item) {
      foundItem = item;
      category = prof;
      break;
    }
  }

  // 2. Search in Monster Resources if not found in gathering
  if (!foundItem && typeof monsterResources !== "undefined") {
    const item = monsterResources.find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase()
    );
    if (item) {
      foundItem = item;
      category = "ALL";
    }
  }

  if (!foundItem) return alert(`"${itemName}" was not found in any database.`);

  // Dupe check
  if (
    trackedItems.find(
      (t) => t.name === foundItem.name && t.rarity === foundItem.rarity
    )
  ) {
    alert("Already tracking this item.");
    itemInput.value = "";
    return;
  }

  let target = prompt("Target quantity?", "100");
  if (target === null) return;

  trackedItems.push({
    id: Date.now(),
    name: foundItem.name,
    current: 0,
    target: parseInt(target) || 100,
    level: foundItem.level,
    rarity: foundItem.rarity,
    profession: category, // Stores job name or 'ALL'
    imgId: foundItem.imgId || null,
  });

  itemInput.value = "";
  saveTrackerState();
  renderTracker();
}

function updateItemValue(id, key, val) {
  const item = trackedItems.find((t) => t.id === id);
  if (item) {
    item[key] = parseInt(val) || 0;
    saveTrackerState();
    renderTracker();
  }
}

function removeTrackedItem(id) {
  // Filter the array to exclude the item with the matching ID
  trackedItems = trackedItems.filter((t) => t.id !== id);

  // Save the new state to LocalStorage
  saveTrackerState();

  // Refresh the UI
  renderTracker();
}

const PROFESSION_SORT_ORDER = {
  Armorer: 1,
  Jeweler: 2,
  Baker: 3,
  Chef: 4,
  Handyman: 5,
  "Weapon Master": 6,
  "Leather Dealer": 7,
  Tailor: 8,
};

let sortDirection = 1; // 1 = Ascending, -1 = Descending

function sortTrackerItems() {
  if (!trackedItems || trackedItems.length === 0) return;

  // Toggle direction on each click
  sortDirection *= -1;

  // Update Button Text
  const btn = document.querySelector(
    ".panel-header button[title='Sort by Profession']"
  );
  if (btn) btn.textContent = sortDirection === 1 ? "↓" : "↑";

  trackedItems.sort((a, b) => {
    const profA = a.profession || "Z_Other";
    const profB = b.profession || "Z_Other";

    // 1. Sort by Custom Priority
    const prioA = PROFESSION_SORT_ORDER[profA] || 100;
    const prioB = PROFESSION_SORT_ORDER[profB] || 100;

    if (prioA !== prioB) {
      return (prioA - prioB) * sortDirection;
    }

    // 2. Secondary Sort: Profession Name (for non-priority jobs like Miner/Farmer)
    const profCompare = profA.localeCompare(profB);
    if (profCompare !== 0) return profCompare * sortDirection;

    // 3. Tertiary Sort: Item Level (INVERTED: High to Low)
    if (a.level !== b.level) {
      return (b.level - a.level) * sortDirection;
    }

    // 4. Quaternary Sort: Item Name (Alphabetical)
    return a.name.localeCompare(b.name);
  });

  // Persist the new order and re-render
  saveTrackerState();
  renderTracker();
}

// ==========================================
// TRACKER RENDER LOGIC
// ==========================================

function setTrackerFilter(filter) {
  currentTrackerFilter = filter;

  // SAVE STATE
  localStorage.setItem("wakfu_tracker_filter", filter);

  // Update UI State
  const buttons = document.querySelectorAll(
    ".tracker-filters .filter-icon-btn"
  );
  buttons.forEach((btn) => btn.classList.remove("active"));

  // Determine ID based on filter
  let btnId = "tf-all";
  if (filter !== "SHOW_ALL") {
    btnId = "tf-" + filter.toLowerCase();
  }

  const activeBtn = document.getElementById(btnId);
  if (activeBtn) activeBtn.classList.add("active");

  renderTracker();
}

function renderTracker() {
  const listEl = getUI("tracker-list");
  if (!listEl) return;

  // Clear current UI
  listEl.innerHTML = "";

  if (trackedItems.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Add items to track...</div>';
    return;
  }

  // --- FILTERING LOGIC ---
  let displayItems = trackedItems;

  if (currentTrackerFilter !== "SHOW_ALL") {
    displayItems = trackedItems.filter((item) => {
      // Trapper Filter: Shows items with profession 'Trapper' AND 'ALL' (Monster Drops)
      if (currentTrackerFilter === "Trapper") {
        return item.profession === "Trapper" || item.profession === "ALL";
      }
      // Exact Match for others (Miner, Farmer, etc.)
      return item.profession === currentTrackerFilter;
    });
  }

  if (displayItems.length === 0) {
    listEl.innerHTML =
      '<div class="empty-state">No items in this category.</div>';
    return;
  }
  // -----------------------

  const isGrid = trackerViewMode === "grid";
  listEl.classList.toggle("grid-view", isGrid);

  // Use displayItems instead of trackedItems for the loop
  displayItems.forEach((item, index) => {
    // ... [Rest of the existing render logic remains exactly the same] ...
    const isComplete = item.current >= item.target && item.target > 0;
    const progress = Math.min((item.current / (item.target || 1)) * 100, 100);

    // 1. TOP-LEFT CORNER ICON (Profession)
    const profNameRaw = item.profession || "z_other";
    const profFilename =
      profNameRaw === "ALL"
        ? "monster_resource"
        : profNameRaw.toLowerCase().replace(/\s+/g, "_");
    const profIconPath = `img/resources/${profFilename}.png`;

    // 2. MAIN ITEM ICON
    let itemIconPath;
    if (item.profession === "ALL" && item.imgId) {
      itemIconPath = `img/items/${item.imgId}.png`;
    } else {
      const safeItemName = item.name.replace(/\s+/g, "_");
      itemIconPath = `img/resources/${safeItemName}.png`;
    }

    const rarityName = (item.rarity || "common").toLowerCase();

    // 3. BUILD TOOLTIP TEXT
    const usageInfo = getItemUsage(item.name);
    const tooltipText = `${
      item.name
    }\nProgress: ${item.current.toLocaleString()} / ${item.target.toLocaleString()} (${Math.floor(
      progress
    )}%)${usageInfo}`;

    if (isGrid) {
      const slot = document.createElement("div");
      slot.className = `inventory-slot ${isComplete ? "complete" : ""}`;
      slot.setAttribute("draggable", "true");
      slot.dataset.index = index;

      slot.onmouseenter = (e) => showTooltip(tooltipText, e);
      slot.onmousemove = (e) => updateTooltipPosition(e);
      slot.onmouseleave = () => hideTooltip();
      slot.onclick = () => openTrackerModal(item.id);

      slot.addEventListener("dragstart", handleTrackDragStart);
      slot.addEventListener("dragover", handleTrackDragOver);
      slot.addEventListener("drop", handleTrackDrop);

      slot.innerHTML = `
                <button class="slot-delete-btn" onclick="event.stopPropagation(); removeTrackedItem(${
                  item.id
                })">×</button>
                <img src="${profIconPath}" class="slot-prof-icon" onerror="this.style.display='none'">
                <img src="${itemIconPath}" class="slot-icon" 
                     onerror="this.onerror=null; this.src='img/resources/not_found.png';">
                <div class="slot-count">${item.current.toLocaleString()}</div>
                <div class="slot-progress-container">
                    <div class="slot-progress-bar" style="width: ${progress}%"></div>
                </div>
            `;
      listEl.appendChild(slot);
    } else {
      const row = document.createElement("div");
      row.className = `tracked-item-row ${isComplete ? "complete" : ""}`;
      row.setAttribute("draggable", "true");
      row.dataset.index = index;

      row.addEventListener("dragstart", handleTrackDragStart);
      row.addEventListener("dragover", handleTrackDragOver);
      row.addEventListener("drop", handleTrackDrop);

      row.innerHTML = `
                <div class="t-left-group" style="cursor: pointer;" onclick="openTrackerModal(${
                  item.id
                })">
                    <img src="${itemIconPath}" class="resource-icon" 
                         onerror="this.onerror=null; this.src='img/resources/not_found.png';">
                    <div class="t-info-text">
                        <img src="img/quality/${rarityName}.png" class="rarity-icon" onerror="this.style.display='none'">
                        <span class="t-level-badge">Lvl. ${item.level}</span>
                        <span class="t-item-name">${item.name}</span>
                    </div>
                </div>
                <div class="t-input-container">
                    <input type="number" class="t-input" value="${
                      item.current
                    }" onchange="updateItemValue(${
        item.id
      }, 'current', this.value)">
                    <span class="t-separator">/</span>
                    <input type="number" class="t-input" value="${
                      item.target
                    }" onchange="updateItemValue(${
        item.id
      }, 'target', this.value)">
                </div>
                <div class="t-right-group">
                    <img src="${profIconPath}" class="t-job-icon" onerror="this.style.display='none'">
                    <div class="t-status-col">
                        <button class="t-delete-btn" onclick="removeTrackedItem(${
                          item.id
                        })">×</button>
                        <span class="t-progress-text">${Math.floor(
                          progress
                        )}%</span>
                    </div>
                </div>
            `;
      const infoArea = row.querySelector(".t-left-group");
      infoArea.onmouseenter = (e) => showTooltip(tooltipText, e);
      infoArea.onmousemove = (e) => updateTooltipPosition(e);
      infoArea.onmouseleave = () => hideTooltip();

      listEl.appendChild(row);
    }
  });
}

// --- Drag & Drop Handlers ---

function handleTrackDragStart(e) {
  this.classList.add("dragging");
  dragSrcIndex = this.dataset.index;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragSrcIndex);
}

function handleTrackDragOver(e) {
  if (e.preventDefault) e.preventDefault(); // Necessary to allow dropping
  e.dataTransfer.dropEffect = "move";
  return false;
}

function handleTrackDragEnter(e) {
  // Only highlight if we are entering a different row than the one we are dragging
  if (this.dataset.index !== dragSrcIndex) {
    this.classList.add("drag-over");
  }
}

function handleTrackDragLeave(e) {
  this.classList.remove("drag-over");
}

function handleTrackDrop(e) {
  if (e.stopPropagation) e.stopPropagation();

  const destIndex = this.dataset.index;

  // Don't do anything if dropping on itself
  if (dragSrcIndex !== destIndex && dragSrcIndex !== null) {
    // Reorder Array
    const fromIdx = parseInt(dragSrcIndex, 10);
    const toIdx = parseInt(destIndex, 10);

    // Remove item from old position
    const movedItem = trackedItems.splice(fromIdx, 1)[0];
    // Insert at new position
    trackedItems.splice(toIdx, 0, movedItem);

    saveTrackerState();
    renderTracker();
  }
  return false;
}

function handleTrackDragEnd(e) {
  this.classList.remove("dragging");
  const rows = document.querySelectorAll(".tracked-item-row");
  rows.forEach((row) => row.classList.remove("drag-over"));
  dragSrcIndex = null;
}

function processItemLog(line) {
  // Target: "You have picked up 92x Taroudium Ore . "
  // Regex looks for digits, then 'x', then grabs everything until a period or multiple spaces
  const match = line.match(/picked up (\d+)x\s+([^.]+)/i);

  if (match) {
    const qty = parseInt(match[1], 10);
    // Clean name: handle non-breaking spaces and trim any extra junk
    const cleanLogName = match[2]
      .replace(/\u00A0/g, " ")
      .trim()
      .toLowerCase();

    let updated = false;
    trackedItems.forEach((item) => {
      // Comparison: ensure the database name matches exactly what we found
      if (item.name.toLowerCase().trim() === cleanLogName) {
        item.current += qty;
        updated = true;
        showTrackerNotification(qty, item.name);
      }
    });

    if (updated) {
      saveTrackerState();
      renderTracker();
    }
  }
}

function showTrackerNotification(qty, itemName, type = "pickup") {
  // Define where to show notifications: Main Window + PiP Window (if open)
  const targets = [document];
  if (pipWindow && pipWindow.document) {
    targets.push(pipWindow.document);
  }

  // Loop through all active windows and spawn the toast
  targets.forEach((doc) => {
    let container = doc.getElementById("tracker-notifications");

    // Safety: Create the container if it doesn't exist in this document
    if (!container) {
      container = doc.createElement("div");
      container.id = "tracker-notifications";
      doc.body.appendChild(container);
    }

    const toast = doc.createElement("div");
    toast.className = "tracker-toast";

    // Handle legacy boolean calls (true = completion, false = pickup)
    if (type === true) type = "completion";
    if (type === false) type = "pickup";

    if (type === "completion") {
      // GOAL REACHED STYLE
      toast.innerHTML = `<strong>★ GOAL REACHED:</strong> ${itemName}`;
      toast.style.borderColor = "#2ecc71"; // Green
      toast.style.color = "#2ecc71";
      toast.style.boxShadow = "0 0 10px rgba(46, 204, 113, 0.4)";
      toast.style.fontSize = "0.95rem";
    } else if (type === "custom") {
      // CUSTOM MESSAGE STYLE (For Professions Calc, etc)
      toast.textContent = itemName; // itemName holds the full message
      toast.style.borderColor = "var(--accent)"; // Blue/Cyan
      toast.style.color = "#fff";
    } else {
      // STANDARD PICKUP STYLE
      toast.textContent = `Picked up ${qty}x ${itemName}`;
    }

    container.appendChild(toast);

    // Lasts longer if it's a completion message
    setTimeout(
      () => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      },
      type === "completion" ? 5000 : 3000
    );
  });
}

// ==========================================
// TRANSLATION CONTROLS
// ==========================================

function toggleLang(lang) {
  if (!transConfig.enabled) toggleMasterSwitch();
  transConfig[lang] = !transConfig[lang];
  updateLangButtons();
}

function toggleMasterSwitch() {
  transConfig.enabled = !transConfig.enabled;
  if (!transConfig.enabled) {
    translationQueue.length = 0;
    isTranslating = false;
  }
  updateLangButtons();
}

function updateLangButtons() {
  document
    .getElementById("btnPT")
    .classList.toggle("active", transConfig.pt && transConfig.enabled);
  document
    .getElementById("btnFR")
    .classList.toggle("active", transConfig.fr && transConfig.enabled);
  document
    .getElementById("btnES")
    .classList.toggle("active", transConfig.es && transConfig.enabled);
  document
    .getElementById("btnOther")
    .classList.toggle("active", transConfig.others && transConfig.enabled);

  const btnMaster = document.getElementById("btnMaster");
  if (transConfig.enabled) {
    btnMaster.className = "lang-btn master-on";
    btnMaster.textContent = "ENABLED";
  } else {
    btnMaster.className = "lang-btn master-off";
    btnMaster.textContent = "DISABLED";
  }
}

// ==========================================
// CORE LOGIC
// ==========================================
async function startTracking(handle) {
  // Save to DB for next time (AWAIT ensures it saves before continuing)
  await saveFileHandleToDB(handle);

  document.getElementById("setup-panel").style.display = "none";
  activeFilename.textContent = handle.name;
  liveIndicator.style.display = "inline-block";

  performReset(true);
  chatList.innerHTML =
    '<div class="empty-state">Waiting for chat logs...</div>';

  try {
    const file = await handle.getFile();
    fileOffset = file.size;
  } catch (e) {
    fileOffset = 0;
  }

  if (parseIntervalId) clearInterval(parseIntervalId);
  parseIntervalId = setInterval(parseFile, 1000);
  startWatchdog();
}

async function parseFile() {
  if (isReading || !fileHandle) return;
  isReading = true;
  try {
    const file = await fileHandle.getFile();
    if (file.size > fileOffset) {
      const blob = file.slice(fileOffset, file.size);
      const text = await blob.text();
      const lines = text.split(/\r?\n/);

      // Process all lines first
      lines.forEach(processLine);

      fileOffset = file.size;

      // BATCH UPDATE: Render UI only ONCE after processing the chunk
      renderMeter();

      if (trackerDirty) {
        saveTrackerState();
        renderTracker();
        trackerDirty = false; // Reset flag
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    isReading = false;
  }
}

function processLine(line) {
  if (!line || line.trim() === "") return;

  const lineLower = line.toLowerCase();

  // EXPLICIT SYSTEM CHECK: Requires the [Bracket Tag] AND the message
  const systemEndPattens = [
    { tag: "[fight log]", msg: "fight is over" },
    { tag: "[information (combat)]", msg: "le combat est terminé" },
    { tag: "[información (combate)]", msg: "el combate ha terminado" },
    { tag: "[registro de lutas]", msg: "a luta terminou" },
  ];

  // Logic for flagging that the battle ended (System only)
  const battleJustFinished = systemEndPattens.some(
    (p) => lineLower.includes(p.tag) && lineLower.includes(p.msg)
  );

  if (battleJustFinished) {
    awaitingNewFight = true;
    updateWatchdogUI();
    // Do not return here, we still need to add to cache,
    // but the flag is now set securely from system logs.
  }

  // Handle Log deduplication
  if (logLineCache.has(line)) return;
  logLineCache.add(line);
  if (logLineCache.size > MAX_CACHE_SIZE) {
    const firstItem = logLineCache.values().next().value;
    logLineCache.delete(firstItem);
  }

  // ROUTING
  try {
    const isLootKeywords = [
      "picked up",
      "ramassé",
      "obtenu",
      "recogido",
      "obtenido",
      "apanhou",
      "obteve",
    ];
    const isLoot = isLootKeywords.some((kw) => lineLower.includes(kw));

    if (isLoot) {
      processItemLog(line);
    } else if (
      lineLower.includes("[fight log]") ||
      lineLower.includes("[information (combat)]") ||
      lineLower.includes("[información (combate)]") ||
      lineLower.includes("[registro de lutas]")
    ) {
      processFightLog(line);
    } else if (line.match(/^\d{2}:\d{2}:\d{2}/)) {
      processChatLog(line);
    }
  } catch (err) {
    console.error("Parsing Error:", err);
  }
}

function processItemLog(line) {
  // Regex: Matches "picked up 92x Item Name" handling trailing dots/spaces
  const match = line.match(/picked up (\d+)x\s+([^.]+)/i);

  if (match) {
    const qty = parseInt(match[1], 10);
    const cleanLogName = match[2]
      .replace(/\u00A0/g, " ")
      .trim()
      .toLowerCase();

    let updated = false;
    trackedItems.forEach((item) => {
      if (item.name.toLowerCase().trim() === cleanLogName) {
        // 1. Check status BEFORE adding
        const wasComplete = item.current >= item.target;

        item.current += qty;
        updated = true;

        const iconPath =
          item.profession === "ALL" && item.imgId
            ? `img/items/${item.imgId}.png`
            : `img/resources/${item.name.replace(/\s+/g, "_")}.png`;

        // 2. Windows Notification (Optional)
        if (typeof sendWindowsNotification === "function") {
          sendWindowsNotification(
            "Item Collected",
            `+${qty} ${item.name} (${item.current}/${item.target})`,
            iconPath
          );
        }

        // 3. Standard UI Toast
        showTrackerNotification(qty, item.name, false);

        // 4. Goal Reached Logic
        if (!wasComplete && item.current >= item.target) {
          setTimeout(() => {
            showTrackerNotification(null, item.name, true);
          }, 200);

          const goalSound = new Audio(
            "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3"
          );
          goalSound.volume = 0.05;
          goalSound.play().catch((e) => {});
        }
      }
    });

    if (updated) {
      // OPTIMIZATION: Do not render here. Just set the flag.
      trackerDirty = true;
    }
  }
}

// ==========================================
// COMBAT METER LOGIC (DMG & HEAL & ARMOR)
// ==========================================
function switchMeterMode(mode) {
  activeMeterMode = mode;

  // Update Main Window
  document
    .getElementById("tab-damage")
    .classList.toggle("active", mode === "damage");
  document
    .getElementById("tab-healing")
    .classList.toggle("active", mode === "healing");
  document
    .getElementById("tab-armor")
    .classList.toggle("active", mode === "armor");

  /// Update PiP Window
  if (pipWindow && pipWindow.document) {
    const pDmg = pipWindow.document.getElementById("pip-tab-damage");
    const pHeal = pipWindow.document.getElementById("pip-tab-healing");
    const pArm = pipWindow.document.getElementById("pip-tab-armor");

    if (pDmg && pHeal && pArm) {
      pDmg.className = "pip-tab" + (mode === "damage" ? " active-dmg" : "");
      pHeal.className = "pip-tab" + (mode === "healing" ? " active-heal" : "");
      pArm.className = "pip-tab" + (mode === "armor" ? " active-armor" : "");
    }
  }
  renderMeter();
}

function detectClass(playerName, spellName) {
  const lowerName = playerName.toLowerCase().trim();

  // Skip detection if this entity is known to be a monster
  if (monsterLookup[lowerName]) return;

  if (spellToClassMap[spellName]) {
    const detected = spellToClassMap[spellName];
    if (playerClasses[playerName] !== detected) {
      playerClasses[playerName] = detected;
      // Clear icon cache so it re-renders with the new class icon
      delete playerIconCache[playerName];
    }
  }
}

function isPlayerAlly(p) {
  // 1. Manual overrides (from dragging) take highest priority for PvP/Mistakes
  if (manualOverrides[p.name]) return manualOverrides[p.name] === "ally";

  const lowerName = p.name.toLowerCase().trim();

  // 2. Check if the name exists in our new multi-language monster database
  // If found in monsterLookup, they are definitely an enemy.
  if (monsterLookup[lowerName]) {
    return false;
  }

  // 3. Default: If not a known monster, assume it's a Player/Ally.
  // Class detection will eventually assign them a Class icon.
  return true;
}

// ==========================================
// ITEM USAGE LOOKUP
// ==========================================
function getItemUsage(itemName) {
  if (typeof PROFESSIONS_DATA === "undefined") return "";

  const usedIn = new Set();
  const targetName = itemName.toLowerCase().trim();

  // Iterate over all professions in the database
  for (const [profName, profData] of Object.entries(PROFESSIONS_DATA)) {
    if (!profData.ranges) continue;

    // Iterate over level ranges
    for (const range of profData.ranges) {
      let found = false;

      // Check standard ingredients list
      if (range.ingredients) {
        if (
          range.ingredients.some((ing) => ing.name.toLowerCase() === targetName)
        ) {
          found = true;
        }
      }

      // Check recipe variants (array of arrays)
      if (!found && range.recipes) {
        for (const recipe of range.recipes) {
          if (recipe.some((ing) => ing.name.toLowerCase() === targetName)) {
            found = true;
            break;
          }
        }
      }

      // If found in this profession, add to Set and stop checking this profession
      if (found) {
        usedIn.add(profName);
        break;
      }
    }
  }

  if (usedIn.size > 0) {
    // Return formatted string for tooltip
    const sortedProfs = Array.from(usedIn).sort().join(", ");
    return `\nUsed in: ${sortedProfs}`;
  }
  return "";
}

// Helper for elements normalization
const elementMap = {
  aire: "Air",
  ar: "Air",
  fuego: "Fire",
  fogo: "Fire",
  feu: "Fire",
  tierra: "Earth",
  terra: "Earth",
  terre: "Earth",
  agua: "Water",
  água: "Water",
  eau: "Water",
  estasis: "Stasis",
  stase: "Stasis",
  luz: "Light",
  lumière: "Light",
};

function normalizeElement(el) {
  if (!el) return null;
  const low = el.toLowerCase();
  return elementMap[low] || low.charAt(0).toUpperCase() + low.slice(1);
}

// Entities that should NEVER own subsequent damage procs
const nonCombatantList = [
  "Gobgob",
  "Beacon",
  "Balise",
  "Standard-Bearing Puppet",
  "Microbot",
  "Cybot",
  "Dial",
  "Cadran",
  "Coney",
  "Lapino",
];

// Helper to find a player by their detected class
function findFirstPlayerByClass(targetClass) {
  return Object.keys(playerClasses).find(
    (name) => playerClasses[name] === targetClass
  );
}

// Helper to ensure damage goes to the rightful class owner
function getSignatureCaster(spellName, defaultCaster) {
  const signatureClass = spellToClassMap[spellName];
  if (!signatureClass) return defaultCaster;

  // Check if the current caster is already the correct class
  if (playerClasses[defaultCaster] === signatureClass) return defaultCaster;

  // If not, try to find a player in the fight who IS that class
  const classOwner = findFirstPlayerByClass(signatureClass);
  return classOwner || defaultCaster;
}

function processFightLog(line) {
  const hpUnits = "HP|PdV|PV";
  const armorUnits = "Armor|Armadura|Armure";
  const numPattern = "[\\d,.\\s]+";

  const parts = line.split(/\] /);
  if (parts.length < 2) return;
  const content = parts[1].trim();

  // Handle Battle Reset logic
  if (
    isAutoResetOn &&
    awaitingNewFight &&
    !content.toLowerCase().includes("over")
  ) {
    performReset(true);
    awaitingNewFight = false;
  }

  // 1. Turn/Time Carryover
  if (content.includes("carried over") || content.includes("tour suivant")) {
    currentSpell = "Passive / Indirect";
    return;
  }

  // 2. Cast Detection
  const castMatch = content.match(
    /^(.*?) (?:casts|lance(?: le sort)?|lanza(?: el hechizo)?|lança(?: o feitiço)?) (.*?)(?:\.|\s\(|$)/i
  );
  if (castMatch) {
    const casterCandidate = castMatch[1].trim();
    const castSpell = castMatch[2].trim();

    if (!nonCombatantList.some((nc) => casterCandidate.includes(nc))) {
      currentCaster = casterCandidate;
      currentSpell = castSpell;
      detectClass(currentCaster, currentSpell);
    }
    return;
  }

  // 3. Action Detection (Damage/Heal/Armor)
  const actionMatch = content.match(
    new RegExp(`^(.*?): ([+-])?(${numPattern}) (${hpUnits}|${armorUnits})(.*)`)
  );
  if (actionMatch) {
    const target = actionMatch[1].trim();
    const sign = actionMatch[2] || "";
    const amount = parseInt(actionMatch[3].replace(/[,.\s]/g, ""), 10);
    const unit = actionMatch[4];
    const suffix = actionMatch[5].trim();

    if (isNaN(amount) || amount <= 0) return;

    // Summon Spawn Filter
    const isSummon =
      typeof allySummons !== "undefined" &&
      allySummons.some((s) => target.toLowerCase().includes(s.toLowerCase()));
    if (sign === "+" && isSummon && unit.match(new RegExp(hpUnits, "i")))
      return;

    // Extract suffixes: e.g., (Fire) (Defensive Orb Shield)
    const details = (suffix.match(/\(([^)]+)\)/g) || []).map((p) =>
      p.slice(1, -1)
    );

    let detectedElement = null;
    let spellOverride = null;
    const noise = [
      "Block!",
      "Critical",
      "Critical Hit",
      "Critical Hit Expert",
      "Slow Influence",
    ];

    for (const d of details) {
      const norm = normalizeElement(d);
      if (norm) {
        detectedElement = norm;
      } else if (!noise.includes(d)) {
        // FIXED: Check if the detail contains a known spell name (e.g., "Defensive Orb Shield" contains "Defensive Orb")
        if (
          d.toLowerCase() === "lost" ||
          d.includes("Potion") ||
          d.includes("Prayer")
        ) {
          spellOverride = d;
        } else {
          const knownMatch = Array.from(allKnownSpells).find((s) =>
            d.includes(s)
          );
          if (knownMatch) spellOverride = knownMatch;
        }
      }
    }

    // ATTRIBUTION LOGIC
    let finalCaster = currentCaster;

    // If it's a heal or armor and we don't have an active caster, attribute to target (self-proc)
    if (
      (sign === "+" || unit.match(new RegExp(armorUnits, "i"))) &&
      (currentCaster === "Unknown" || !currentCaster)
    ) {
      finalCaster = target;
    }

    let finalSpell = spellOverride || currentSpell;

    // SIGNATURE REROUTING (Forces spells like Tetatoxin or Defensive Orb to the right class)
    if (finalSpell !== "Unknown Spell" && finalSpell !== "Passive / Indirect") {
      finalCaster = getSignatureCaster(finalSpell, finalCaster);
    }

    // Bind summons to masters
    if (summonBindings[finalCaster]) {
      const master = summonBindings[finalCaster];
      finalSpell = `${finalSpell} (${finalCaster})`;
      finalCaster = master;
    }

    // Reflect logic
    if (["Burning Armor", "Armadura Ardiente"].includes(spellOverride)) {
      finalCaster = target;
    }

    const isArmor = unit.match(new RegExp(armorUnits, "i"));
    if (isArmor) {
      // FIXED: Attribute Armor to the CASTER (Feca), not the target.
      updateCombatData(armorData, finalCaster, finalSpell, amount, null);
    } else if (sign === "+") {
      updateCombatData(
        healData,
        finalCaster,
        finalSpell,
        amount,
        detectedElement || "Neutral"
      );
    } else {
      updateCombatData(
        fightData,
        finalCaster,
        finalSpell,
        amount,
        detectedElement || "Neutral"
      );
    }

    lastCombatTime = Date.now();
    updateWatchdogUI();
  }
}

function normalizeElement(el) {
  if (!el) return null;
  const low = el.toLowerCase().trim();
  const elementMap = {
    // English
    fire: "Fire",
    water: "Water",
    earth: "Earth",
    air: "Air",
    stasis: "Stasis",
    light: "Light",
    // French
    feu: "Fire",
    eau: "Water",
    terre: "Earth",
    aire: "Air",
    stase: "Stasis",
    lumière: "Light",
    // Spanish
    fuego: "Fire",
    agua: "Water",
    tierra: "Earth",
    aire: "Air",
    estasis: "Stasis",
    luz: "Light",
    // Portuguese
    fogo: "Fire",
    água: "Water",
    terra: "Earth",
    ar: "Air",
    estase: "Stasis",
    luz: "Light",
  };
  return (
    elementMap[low] ||
    (["Fire", "Water", "Earth", "Air", "Stasis", "Light"].includes(el)
      ? el
      : null)
  );
}

// Helper to keep code clean
function routeCombatData(
  unit,
  armorUnits,
  sign,
  caster,
  spell,
  amount,
  element
) {
  if (unit.match(new RegExp(armorUnits, "i"))) {
    updateCombatData(armorData, caster, spell, amount, null);
  } else if (sign === "+") {
    updateCombatData(healData, caster, spell, amount, element);
  } else {
    updateCombatData(fightData, caster, spell, amount, element);
  }
}

function updateCombatData(dataSet, player, spell, amount, element) {
  if (!dataSet[player])
    dataSet[player] = { name: player, total: 0, spells: {} };
  dataSet[player].total += amount;

  const spellKey = `${spell}|${element || "neutral"}`;
  if (!dataSet[player].spells[spellKey]) {
    dataSet[player].spells[spellKey] = {
      val: 0,
      element: element,
      realName: spell,
    };
  }
  dataSet[player].spells[spellKey].val += amount;
}

function togglePlayer(name) {
  if (expandedPlayers.has(name)) expandedPlayers.delete(name);
  else expandedPlayers.add(name);
  renderMeter();
}

function expandAll() {
  let dataSet;
  if (activeMeterMode === "damage") dataSet = fightData;
  else if (activeMeterMode === "healing") dataSet = healData;
  else dataSet = armorData;

  Object.keys(dataSet).forEach((name) => expandedPlayers.add(name));
  renderMeter();
}

function collapseAll() {
  expandedPlayers.clear();
  renderMeter();
}

// Helper: Determine if a player object belongs to Allies or Enemies
function isPlayerAlly(p) {
  if (manualOverrides[p.name]) return manualOverrides[p.name] === "ally";

  // 1. Check Enemy DB first (Strict)
  if (typeof wakfuEnemies !== "undefined") {
    const isEnemy = wakfuEnemies.some((fam) =>
      p.name.toLowerCase().includes(fam.toLowerCase())
    );
    if (isEnemy || p.name.includes("Punchy") || p.name.includes("Papas"))
      return false;
  }

  // 2. Class Detection
  if (playerClasses[p.name]) return true;

  // 3. Summons
  if (typeof allySummons !== "undefined" && allySummons.includes(p.name))
    return true;

  return false; // Default to Enemy for unknowns
}

// New Function: Expand or Collapse specific category
function modifyExpansion(category, action) {
  // Determine which dataset we are currently looking at
  let dataSet;
  if (activeMeterMode === "damage") dataSet = fightData;
  else if (activeMeterMode === "healing") dataSet = healData;
  else dataSet = armorData;

  const players = Object.values(dataSet);

  players.forEach((p) => {
    const isAlly = isPlayerAlly(p);

    // Match player to the clicked header (Allies vs Enemies)
    if (
      (category === "allies" && isAlly) ||
      (category === "enemies" && !isAlly)
    ) {
      if (action === "expand") {
        expandedPlayers.add(p.name);
      } else {
        expandedPlayers.delete(p.name);
      }
    }
  });

  // Re-render to show changes
  renderMeter();
}

function performReset() {
  fightData = {};
  healData = {};
  armorData = {};
  playerClasses = {};
  summonBindings = {};
  playerIconCache = {};
  playerVariantState = {};
  manualOverrides = {};
  currentCaster = "Unknown";
  currentSpell = "Unknown Spell";

  // IMPORTANT: Reset our state flag
  awaitingNewFight = false;

  renderMeter();
  updateWatchdogUI();
}

document.getElementById("resetBtn").addEventListener("click", performReset);

// ==========================================
// RENDER METER
// ==========================================
function renderMeter() {
  let dataSet;
  if (activeMeterMode === "damage") dataSet = fightData;
  else if (activeMeterMode === "healing") dataSet = healData;
  else dataSet = armorData;

  const players = Object.values(dataSet);

  // Use getUI helper to ensure compatibility with Picture-in-Picture window
  const alliesContainer = getUI("list-allies");
  const enemiesContainer = getUI("list-enemies");
  const alliesTotalEl = getUI("allies-total-val");
  const enemiesTotalEl = getUI("enemies-total-val");

  if (!alliesContainer || !enemiesContainer) return;

  if (players.length === 0) {
    alliesContainer.innerHTML = `<div class="empty-state">Waiting for combat...</div>`;
    enemiesContainer.innerHTML = "";
    alliesTotalEl.textContent = "0";
    enemiesTotalEl.textContent = "0";
    return;
  }

  const allies = [];
  const enemies = [];

  players.forEach((p) => {
    if (isPlayerAlly(p)) {
      allies.push(p);
    } else {
      enemies.push(p);
    }
  });

  const totalAllyVal = allies.reduce((acc, p) => acc + p.total, 0);
  const totalEnemyVal = enemies.reduce((acc, p) => acc + p.total, 0);

  alliesTotalEl.textContent = totalAllyVal.toLocaleString();
  enemiesTotalEl.textContent = totalEnemyVal.toLocaleString();

  allies.sort((a, b) => b.total - a.total);
  enemies.sort((a, b) => b.total - a.total);

  const renderList = (list, container, categoryTotal) => {
    container.innerHTML = "";
    if (list.length === 0) {
      container.innerHTML =
        '<div style="padding:10px;color:#555;font-style:italic;text-align:center;">None</div>';
      return;
    }

    const maxVal = list[0].total;

    list.forEach((p) => {
      const barPercent = (p.total / maxVal) * 100;
      const totalPercent =
        categoryTotal > 0
          ? ((p.total / categoryTotal) * 100).toFixed(1) + "%"
          : "0.0%";
      const isExpanded = expandedPlayers.has(p.name);

      // --- ICON LOGIC ---
      let iconHtml = playerIconCache[p.name];
      if (!iconHtml) {
        const lowerName = p.name.toLowerCase().trim();
        const monsterImgId = monsterLookup[lowerName];

        if (monsterImgId) {
          iconHtml = `<img src="./img/monsters/${monsterImgId}" class="class-icon" onerror="this.src='./img/classes/not_found.png';">`;
        } else {
          const classIconName = playerClasses[p.name];
          if (classIconName) {
            const isAlt = playerVariantState[p.name];
            const currentSrc = isAlt
              ? `./img/classes/${classIconName}-f.png`
              : `./img/classes/${classIconName}.png`;
            iconHtml = `<img src="${currentSrc}" class="class-icon" onmouseover="toggleIconVariant('${p.name.replace(
              /'/g,
              "\\'"
            )}', this)" onerror="this.src='./img/classes/not_found.png';">`;
          } else {
            iconHtml = `<img src="./img/classes/not_found.png" class="class-icon">`;
          }
        }
        playerIconCache[p.name] = iconHtml;
      }

      // Create the main block
      const rowBlock = document.createElement("div");
      rowBlock.className = `player-block ${isExpanded ? "expanded" : ""}`;
      rowBlock.setAttribute("draggable", "true");

      // --- DRAG & DROP BINDING EVENTS (RE-ENABLED) ---
      rowBlock.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", p.name);
        rowBlock.style.opacity = "0.5";
      });
      rowBlock.addEventListener("dragend", (e) => {
        rowBlock.style.opacity = "1";
      });
      rowBlock.addEventListener("dragover", (e) => {
        e.preventDefault();
        rowBlock.classList.add("drag-target");
      });
      rowBlock.addEventListener("dragleave", () => {
        rowBlock.classList.remove("drag-target");
      });
      rowBlock.addEventListener("drop", (e) => {
        e.preventDefault();
        rowBlock.classList.remove("drag-target");
        const draggedName = e.dataTransfer.getData("text/plain");
        const targetMasterName = p.name;

        if (draggedName && draggedName !== targetMasterName) {
          summonBindings[draggedName] = targetMasterName;
          mergeSummonData(draggedName, targetMasterName);
          renderMeter();
        }
      });

      let barClass =
        activeMeterMode === "damage"
          ? "damage-bar"
          : activeMeterMode === "healing"
          ? "healing-bar"
          : "armor-bar";
      let textClass =
        activeMeterMode === "damage"
          ? "damage-text"
          : activeMeterMode === "healing"
          ? "healing-text"
          : "armor-text";

      const mainRow = document.createElement("div");
      mainRow.className = "player-row";
      mainRow.onclick = () => togglePlayer(p.name);

      mainRow.innerHTML = `
                <div class="player-bg-bar ${barClass}" style="width: ${barPercent}%"></div>
                <div class="player-name">
                    <span class="caret">▶</span>
                    ${iconHtml}
                    ${p.name}
                </div>
                <div class="player-total ${textClass}">${p.total.toLocaleString()}</div>
                <div class="player-percent">${totalPercent}</div>
            `;
      rowBlock.appendChild(mainRow);

      if (isExpanded) {
        const spellContainer = document.createElement("div");
        spellContainer.className = "spell-list open";

        const spells = Object.entries(p.spells)
          .map(([key, data]) => ({
            key,
            val: data.val,
            element: data.element,
            realName: data.realName || key.split("|")[0],
          }))
          .sort((a, b) => b.val - a.val);

        spells.forEach((s) => {
          const spellBarPercent = (s.val / p.total) * 100;
          const spellContribPercent =
            p.total > 0 ? ((s.val / p.total) * 100).toFixed(1) + "%" : "0.0%";

          let iconName = (s.element || "neutral").toLowerCase();
          const iconHtmlSpell = `<img src="./img/elements/${iconName}.png" class="spell-icon" onerror="this.src='./img/elements/neutral.png'">`;

          const spellRow = document.createElement("div");
          spellRow.className = "spell-row";
          spellRow.innerHTML = `
                        <div class="spell-bg-bar" style="width: ${spellBarPercent}%"></div>
                        <div class="spell-info">
                            ${iconHtmlSpell}
                            <span class="spell-name">${s.realName}</span>
                        </div>
                        <div class="spell-val">${s.val.toLocaleString()}</div>
                        <div class="spell-percent">${spellContribPercent}</div>
                    `;
          spellContainer.appendChild(spellRow);
        });
        rowBlock.appendChild(spellContainer);
      }
      container.appendChild(rowBlock);
    });
  };

  renderList(allies, alliesContainer, totalAllyVal);
  renderList(enemies, enemiesContainer, totalEnemyVal);
}

// ==========================================
// CHAT TRANSLATOR LOGIC
// ==========================================
const CHAT_COLORS = {
  Vicinity: "#cccccc",
  Private: "#00e1ff",
  Group: "#aa66ff",
  Guild: "#ffaa00",
  Trade: "#dd7700",
  Politics: "#ffff00",
  PvP: "#00aaaa",
  Community: "#3366ff",
  Recruitment: "#ff2255",
  Default: "#888888",
};

function getChannelColor(channelName) {
  if (channelName.includes("Vicinity")) return CHAT_COLORS.Vicinity;
  if (channelName.includes("Private") || channelName.includes("Whisper"))
    return CHAT_COLORS.Private;
  if (channelName.includes("Group")) return CHAT_COLORS.Group;
  if (channelName.includes("Guild")) return CHAT_COLORS.Guild;
  if (channelName.includes("Trade")) return CHAT_COLORS.Trade;
  if (channelName.includes("Politics")) return CHAT_COLORS.Politics;
  if (channelName.includes("PvP")) return CHAT_COLORS.PvP;
  if (channelName.includes("Community")) return CHAT_COLORS.Community;
  if (channelName.includes("Recruitment")) return CHAT_COLORS.Recruitment;
  return CHAT_COLORS.Default;
}

function formatLocalTime(rawTimeStr) {
  const [hours, mins] = rawTimeStr.split(":");
  const date = new Date();
  date.setHours(parseInt(hours), parseInt(mins), 0);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function processChatLog(line) {
  const parts = line.split(" - ");
  if (parts.length < 2) return;

  // parts[0] is the timestamp "16:49:04,123"
  const rawTime = parts[0].split(",")[0];
  const localTime = formatLocalTime(rawTime);

  const rest = parts.slice(1).join(" - ");

  let channel = "General";
  let author = "";
  let message = rest;

  const bracketMatch = rest.match(/^\[(.*?)\] (.*)/);
  if (bracketMatch) {
    channel = bracketMatch[1];
    const contentAfter = bracketMatch[2];
    const authorSplit = contentAfter.indexOf(" : ");
    if (authorSplit !== -1) {
      author = contentAfter.substring(0, authorSplit);
      message = contentAfter.substring(authorSplit + 3);
    } else {
      message = contentAfter;
    }
  } else {
    const authorSplit = rest.indexOf(" : ");
    if (authorSplit !== -1) {
      author = rest.substring(0, authorSplit);
      message = rest.substring(authorSplit + 3);
      if (channel === "General") channel = "Vicinity";
    }
  }
  addChatMessage(localTime, channel, author, message);
}

function setChatFilter(filter) {
  currentChatFilter = filter;
  document
    .querySelectorAll(".filter-btn")
    .forEach((btn) => btn.classList.remove("active"));
  const btnId =
    "filter" +
    (filter === "all"
      ? "ALL"
      : filter === "recruitment"
      ? "RECRUIT"
      : filter === "community"
      ? "COMM"
      : filter.toUpperCase());
  const activeBtn = document.getElementById(btnId);
  if (activeBtn) activeBtn.classList.add("active");

  const messages = document.querySelectorAll(".chat-msg");
  messages.forEach((msg) => {
    const cat = msg.getAttribute("data-category");
    if (cat === "vicinity" || cat === "private") {
      msg.style.display = "block";
    } else if (currentChatFilter === "all") {
      msg.style.display = "block";
    } else {
      if (cat === currentChatFilter) msg.style.display = "block";
      else msg.style.display = "none";
    }
  });
  chatList.scrollTop = chatList.scrollHeight;
}

function mergeSummonData(summon, master) {
  // We iterate through all 3 categories: damage, healing, and armor
  [fightData, healData, armorData].forEach((dataSet) => {
    if (dataSet[summon]) {
      // Create master entry if they don't exist in this specific dataset yet
      if (!dataSet[master]) {
        dataSet[master] = { name: master, total: 0, spells: {} };
      }

      // 1. Move the total value
      dataSet[master].total += dataSet[summon].total;

      // 2. Move and prefix the spells so you know they came from the summon
      Object.entries(dataSet[summon].spells).forEach(([key, s]) => {
        const originalName = s.realName || key.split("|")[0];
        const newSpellName = `${originalName} (${summon})`;
        const element = s.element || "Neutral";
        const newKey = `${newSpellName}|${element}`;

        if (!dataSet[master].spells[newKey]) {
          dataSet[master].spells[newKey] = {
            val: 0,
            element: element,
            realName: newSpellName,
          };
        }
        dataSet[master].spells[newKey].val += s.val;
      });

      // 3. Remove the summon from the top level so they disappear from the list
      delete dataSet[summon];

      // 4. Clear icon cache for the master to ensure clean re-render
      delete playerIconCache[master];
    }
  });
}

// CHAT CHANNEL CATEGORIES
function getCategoryFromChannel(channelName) {
  const lower = channelName.toLowerCase();

  // Vicinity: Vicinity, Proximité, Local, Vizinhança
  if (
    lower.includes("vicinity") ||
    lower.includes("proximit") ||
    lower.includes("local") ||
    lower.includes("vizinhança")
  )
    return "vicinity";

  // Private: Private, Whisper, Privé, Privado
  if (
    lower.includes("private") ||
    lower.includes("whisper") ||
    lower.includes("priv")
  )
    return "private";

  // Group: Group, Groupe, Grupo
  if (
    lower.includes("group") ||
    lower.includes("groupe") ||
    lower.includes("grupo")
  )
    return "group";

  // Guild: Guild, Guilde, Gremio, Guilda
  if (
    lower.includes("guild") ||
    lower.includes("guilde") ||
    lower.includes("gremio")
  )
    return "guild";

  // Trade: Trade, Commerce, Comercio, Comércio
  if (
    lower.includes("trade") ||
    lower.includes("commerce") ||
    lower.includes("comercio")
  )
    return "trade";

  // Community: Community, Communauté, Comunidad, Comunidade
  if (
    lower.includes("community") ||
    lower.includes("communaut") ||
    lower.includes("comunidad") ||
    lower.includes("comunidade")
  )
    return "community";

  // Recruitment: Recruitment, Recrutement, Reclutamiento, Recrutamento
  if (
    lower.includes("recruitment") ||
    lower.includes("recrutement") ||
    lower.includes("reclutamiento") ||
    lower.includes("recrutamento")
  )
    return "recruitment";

  // Politics: Politics, Politique, Política
  if (lower.includes("politic")) return "politics";

  // PvP: PvP, JcJ, Camp
  if (lower.includes("pvp") || lower.includes("jcj") || lower.includes("camp"))
    return "pvp";

  return "other";
}

function getChannelColor(category) {
  const map = {
    vicinity: CHAT_COLORS.Vicinity,
    private: CHAT_COLORS.Private,
    group: CHAT_COLORS.Group,
    guild: CHAT_COLORS.Guild,
    trade: CHAT_COLORS.Trade,
    politics: CHAT_COLORS.Politics,
    pvp: CHAT_COLORS.PvP,
    community: CHAT_COLORS.Community,
    recruitment: CHAT_COLORS.Recruitment,
  };
  return map[category] || CHAT_COLORS.Default;
}

function addChatMessage(time, channel, author, message) {
  const emptyState = chatList.querySelector(".empty-state");
  if (emptyState) chatList.innerHTML = "";

  // MEMORY FIX: Prune old messages if we exceed the limit
  while (chatList.children.length >= MAX_CHAT_HISTORY) {
    chatList.removeChild(chatList.firstChild);
  }

  const div = document.createElement("div");
  div.className = "chat-msg";

  // 1. Get Category (Multi-language logic)
  const category = getCategoryFromChannel(channel);
  div.setAttribute("data-category", category);

  // 2. Get Color based on that Category
  const color = getChannelColor(category);

  // Optimization: Don't set style.display if default is block, handles CSS better
  if (
    currentChatFilter !== "all" &&
    category !== "vicinity" &&
    category !== "private" &&
    category !== currentChatFilter
  ) {
    div.style.display = "none";
  }

  const transId =
    "trans-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  const channelTag = `[${channel}]`;

  // --- NEW: Game Log Number Highlighting ---
  let displayMessage = message;
  // Check if channel contains "Log" (Game Log, Combat Log, etc.) or is Information
  if (
    channel.toLowerCase().includes("log") ||
    channel.toLowerCase().includes("info")
  ) {
    // Regex matches: Optional +/- start, digits, optional comma/dot separators
    displayMessage = message.replace(
      /(?:\+|-)?\d+(?:[.,]\d+)*/g,
      '<span class="game-log-number">$&</span>'
    );
  }
  // -----------------------------------------

  // Use efficient template literal
  div.innerHTML = `
        <div class="chat-meta">
            <span class="chat-time">${time}</span>
            <span class="chat-channel" style="color:${color}">${channelTag}</span>
            <span class="chat-author" style="color:${color}">${author}</span>
            <button class="manual-trans-btn" onclick="queueTranslation('${message.replace(
              /'/g,
              "\\'"
            )}', '${transId}', true)">T</button>
        </div>
        <div class="chat-content">${displayMessage}</div>
        <div id="${transId}" class="translated-block" style="display:none;"></div>
    `;

  chatList.appendChild(div);

  chatList.scrollTop = chatList.scrollHeight;

  // Translation logic...
  if (transConfig.enabled) {
    if (channel.includes("(PT)") && !transConfig.pt) return;
    if (channel.includes("(FR)") && !transConfig.fr) return;
    if (channel.includes("(ES)") && !transConfig.es) return;
    queueTranslation(message, transId, false);
  }
}

function queueTranslation(text, elementId, isManual) {
  translationQueue.push({ text, elementId, isManual });
  processTranslationQueue();
}

async function processTranslationQueue() {
  if (isTranslating || translationQueue.length === 0) return;

  const item = translationQueue[0];

  if (!transConfig.enabled && !item.isManual) {
    translationQueue.length = 0;
    return;
  }

  isTranslating = true;
  translationQueue.shift();

  try {
    if (item.text.length < 500) {
      const result = await fetchTranslation(item.text);
      if (result) {
        const l = result.lang.toLowerCase();
        let show = false;

        if (item.isManual) {
          show = true;
        } else {
          if (transConfig.pt && (l === "pt" || l.startsWith("pt-")))
            show = true;
          else if (transConfig.fr && (l === "fr" || l.startsWith("fr-")))
            show = true;
          else if (transConfig.es && (l === "es" || l.startsWith("es-")))
            show = true;
          else if (l === "en" || l.startsWith("en-")) show = false;
          else if (transConfig.others) {
            if (
              !l.startsWith("pt") &&
              !l.startsWith("fr") &&
              !l.startsWith("es")
            )
              show = true;
          }
        }

        if (show) {
          const el = document.getElementById(item.elementId);
          if (el) {
            el.style.display = "flex";
            el.innerHTML = `<span class="trans-icon">文A</span> ${result.text}`;
          }
        }
      }
    }
  } catch (e) {}

  isTranslating = false;
  setTimeout(processTranslationQueue, 50);
}

async function fetchTranslation(text) {
  const sourceUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(
    text
  )}`;
  try {
    const response = await fetch(sourceUrl);
    const data = await response.json();
    if (data) {
      const translatedText = data[0].map((x) => x[0]).join("");
      const detectedLang = data[2];
      return { text: translatedText, lang: detectedLang };
    }
  } catch (e) {
    return null;
  }
  return null;
}

clearChatBtn.addEventListener("click", () => {
  chatList.innerHTML = '<div class="empty-state">Chat cleared</div>';
});

// ==========================================
// WATCHDOG (AUTO RESET)
// ==========================================
autoResetBtn.addEventListener("click", () => {
  isAutoResetOn = !isAutoResetOn;
  // SAVE STATE
  localStorage.setItem("wakfu_auto_reset", isAutoResetOn);

  autoResetBtn.classList.toggle("active", isAutoResetOn);
  updateWatchdogUI();
});

function startWatchdog() {
  if (watchdogIntervalId) clearInterval(watchdogIntervalId);
  watchdogIntervalId = setInterval(updateWatchdogUI, 500);
}

function updateWatchdogUI() {
  // autoResetText and autoResetBtn were defined at the top of the script
  if (!autoResetText || !autoResetBtn) return;

  if (!isAutoResetOn) {
    autoResetText.textContent = "Auto Reset: OFF";
    autoResetBtn.style.borderColor = "#444";
    autoResetText.style.color = "#aaa";
    return;
  }

  // Handle visual states for the new event-based system
  if (awaitingNewFight) {
    autoResetText.textContent = "READY (Wait next fight)";
    autoResetText.style.color = "#00e1ff";
    autoResetBtn.style.borderColor = "#00e1ff";
  } else if (Object.keys(fightData).length > 0) {
    autoResetText.textContent = "Next Battle Clears Meter";
    autoResetText.style.color = "#fff";
    autoResetBtn.style.borderColor = "var(--btn-active-green)";
  } else {
    autoResetText.textContent = "Auto Reset: ON";
    autoResetText.style.color = "#fff";
    autoResetBtn.style.borderColor = "var(--btn-active-green)";
  }
}

// ==========================================
// FOOTER UTILITIES (Daily Timer)
// ==========================================

// DAILY RESET TIMER (Europe/Paris Timezone)
function updateDailyTimer() {
  const timerEl = document.getElementById("daily-val");
  if (!timerEl) return;

  // Get current time in Paris
  const now = new Date();
  // We use the Intl API to get the correct time in Paris handling DST automatically
  const parisTimeStr = now.toLocaleString("en-US", {
    timeZone: "Europe/Paris",
  });
  const parisDate = new Date(parisTimeStr);

  // Create a target date for "Tomorrow 00:00:00" in Paris time
  const nextMidnight = new Date(parisDate);
  nextMidnight.setHours(24, 0, 0, 0);

  const diffMs = nextMidnight - parisDate;

  // Convert to HH:MM
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

  const hStr = hours.toString().padStart(2, "0");
  const mStr = minutes.toString().padStart(2, "0");

  timerEl.textContent = `${hStr}:${mStr}`;
}

// SIDEBAR TOGGLE
function toggleSidebar() {
  const sidebar = document.getElementById("info-sidebar");
  sidebar.classList.toggle("open");
}

// Sidebar Section Toggle
function toggleSidebarSection(id) {
  const section = document.getElementById(id);
  if (section) {
    section.classList.toggle("collapsed");
  }
}

// ==========================================
// DUNGEON FORECAST SYSTEM (DB Version)
// ==========================================
let currentForecastDate = new Date();
let forecastViewMode = "tab"; // 'tab' or 'grid'
let activeDungeonTab = "classic"; // 'classic' or 'modular'

async function initForecast() {
  // Set current date based on Paris time
  const parisString = new Date().toLocaleString("en-US", {
    timeZone: "Europe/Paris",
  });
  currentForecastDate = new Date(parisString);

  renderForecastUI();

  // Bind Global Buttons (Previous/Next)
  // We re-bind inside render usually, but static binds here are fine if elements exist
  const btnPrev = document.getElementById("fc-prev");
  const btnNext = document.getElementById("fc-next");
  if (btnPrev) btnPrev.onclick = () => changeForecastDay(-1);
  if (btnNext) btnNext.onclick = () => changeForecastDay(1);
}

// --- Navigation ---
function changeForecastDay(days) {
  currentForecastDate.setDate(currentForecastDate.getDate() + days);
  renderForecastUI();
}

function toggleForecastViewMode() {
  forecastViewMode = forecastViewMode === "tab" ? "grid" : "tab";
  renderForecastUI();
}

function setDungeonTab(tab) {
  activeDungeonTab = tab;
  renderForecastUI();
}

// --- Helpers ---
function getFormattedDate(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

// --- Main Render Function ---
function renderForecastUI() {
  const displayDate = getFormattedDate(currentForecastDate);
  const nowParis = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
  const isToday =
    currentForecastDate.getDate() === nowParis.getDate() &&
    currentForecastDate.getMonth() === nowParis.getMonth() &&
    currentForecastDate.getFullYear() === nowParis.getFullYear();

  const headerContainer = document.getElementById("forecast-header-sticky");
  const listContainer = document.getElementById("forecast-list-scrollable");

  if (!headerContainer || !listContainer) return;

  // 1. Render the Header (Sticky Part)
  headerContainer.innerHTML = `
        <div class="forecast-nav">
            <button onclick="changeForecastDay(-1)">&lt;</button>
            <span id="fc-date-display">${
              isToday ? `TODAY (${displayDate})` : displayDate
            }</span>
            <button onclick="changeForecastDay(1)">&gt;</button>
            <button class="forecast-view-btn" onclick="toggleForecastViewMode()">
                ${forecastViewMode === "tab" ? "⊞" : "☰"}
            </button>
        </div>
        ${
          forecastViewMode === "tab"
            ? `
            <div class="forecast-tabs">
                <div class="fc-tab ${
                  activeDungeonTab === "classic" ? "active" : ""
                }" onclick="setDungeonTab('classic')">
                    🎯 GUILD HUNTERS
                </div>
                <div class="fc-tab ${
                  activeDungeonTab === "modular" ? "active" : ""
                }" onclick="setDungeonTab('modular')">
                    ⚔️ MODULUX
                </div>
            </div>
        `
            : ""
        }
    `;

  // 2. Render the List (Scrollable Part)
  const dungeons =
    typeof FORECAST_DB !== "undefined" ? FORECAST_DB[displayDate] : null;
  if (!dungeons || dungeons.length === 0) {
    listContainer.innerHTML =
      '<div style="text-align:center; padding:20px; color:#666;">No data for this date.</div>';
    return;
  }

  const classic = dungeons.filter((d) => d.type.startsWith("DJ"));
  const modular = dungeons.filter((d) => d.type.startsWith("Modulox"));
  const classicNames = new Set(classic.map((d) => d.name));
  const modularNames = new Set(modular.map((d) => d.name));
  const intersections = new Set(
    [...classicNames].filter((x) => modularNames.has(x))
  );

  if (forecastViewMode === "grid") {
    renderGridView(listContainer, classic, modular, intersections);
  } else {
    renderTabView(listContainer, classic, modular, intersections);
  }
}

// Full Grid View function
function renderGridView(container, classicList, modularList, intersections) {
  let html = `<div class="forecast-grid">`;
  html += renderGridColumn(
    classicList,
    "GUILD",
    "🎯",
    "type-classic",
    intersections
  );
  html += renderGridColumn(
    modularList,
    "MODULUX",
    "⚔️",
    "type-modular",
    intersections
  );
  html += `</div>`;
  container.innerHTML = html;
}

function renderGridColumn(list, title, emoji, typeClass, intersections) {
  let colHtml = `<div class="forecast-col">
        <div class="forecast-subsection-header">
            <div class="header-left"><span>${emoji} ${title}</span></div>
        </div>
        <div class="forecast-subsection-content" style="display:block;">`;

  if (list.length === 0)
    colHtml += `<div style="padding:10px; font-size:0.8em; color:#666;">None</div>`;
  else {
    list.forEach((d) => {
      const { badgeColor, typeLabel } = getDungeonStyles(d.type);
      const isIntersected = intersections.has(d.name) ? "is-intersected" : "";

      // Get Location
      const location =
        typeof DUNGEON_LOCATIONS !== "undefined" && DUNGEON_LOCATIONS[d.name]
          ? DUNGEON_LOCATIONS[d.name]
          : "Location Unknown";

      colHtml += `
            <div class="compact-forecast-item ${typeClass} ${isIntersected}" title="${d.name}" data-tooltip="${location}">
                <span class="compact-badge" style="background:${badgeColor};">${typeLabel}</span>
                <span class="compact-name">${d.name}</span>
            </div>`;
    });
  }
  colHtml += `</div></div>`;
  return colHtml;
}

// Full Tab View function
function renderTabView(container, classicList, modularList, intersections) {
  const targetList = activeDungeonTab === "classic" ? classicList : modularList;
  const typeClass =
    activeDungeonTab === "classic" ? "type-classic" : "type-modular";

  let html = `<div class="forecast-list-container">`;
  if (targetList.length === 0) {
    html += `<div style="padding:20px; text-align:center; color:#888; font-style:italic;">No dungeons found for this category.</div>`;
  } else {
    targetList.forEach((d) => {
      const { badgeColor, typeLabel } = getDungeonStyles(d.type);
      const isIntersected = intersections.has(d.name) ? "is-intersected" : "";

      // Location Lookup
      const location =
        typeof DUNGEON_LOCATIONS !== "undefined" && DUNGEON_LOCATIONS[d.name]
          ? DUNGEON_LOCATIONS[d.name]
          : "Location Unknown";

      html += `
            <div class="full-forecast-item ${typeClass} ${isIntersected}" data-tooltip="${location}">
                <span class="badge" style="background:${badgeColor};">${typeLabel}</span>
                <span class="name">${d.name}</span>
            </div>`;
    });
  }
  html += `</div>`;
  container.innerHTML = html;
}

// --- Shared Helper for Colors/Labels ---
function getDungeonStyles(rawType) {
  let badgeColor = "#27ae60"; // Default Green

  if (rawType.includes("231")) badgeColor = "#e67e22"; // Orange
  else if (rawType.includes("216")) badgeColor = "#9b59b6"; // Purple
  else if (rawType.includes("201") || rawType.includes("186"))
    badgeColor = "#3498db"; // Blue

  let rawRange = rawType.replace(/^(DJ|Modulox)\s*/i, "").trim();

  return {
    badgeColor: badgeColor,
    typeLabel: `Lvl. ${rawRange}`,
  };
}

// ==========================================
// PICTURE IN PICTURE LOGIC
// ==========================================
async function togglePiP(elementId, title) {
  const playerElement = document.getElementById(elementId);

  // If PiP is already open, close it
  if (pipWindow) {
    pipWindow.close();
    pipWindow = null;
    return;
  }

  // Check for browser support
  if (!("documentPictureInPicture" in window)) {
    alert(
      "Your browser does not support Document Picture-in-Picture. Please use the latest version of Chrome, Edge, or Opera."
    );
    return;
  }

  try {
    pipWindow = await window.documentPictureInPicture.requestWindow({
      width: elementId === "chat-list" ? 400 : 450,
      height: 500,
    });

    // Copy Global Functions to PiP Window so buttons work
    pipWindow.switchMeterMode = window.switchMeterMode;
    pipWindow.toggleIconVariant = window.toggleIconVariant;
    pipWindow.modifyExpansion = window.modifyExpansion;
    pipWindow.showTooltip = window.showTooltip;
    pipWindow.updateTooltipPosition = window.updateTooltipPosition;
    pipWindow.hideTooltip = window.hideTooltip;

    // Copy Styles from the main document to the PiP document
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        if (styleSheet.cssRules) {
          const newStyle = pipWindow.document.createElement("style");
          [...styleSheet.cssRules].forEach((rule) => {
            newStyle.appendChild(
              pipWindow.document.createTextNode(rule.cssText)
            );
          });
          pipWindow.document.head.appendChild(newStyle);
        } else if (styleSheet.href) {
          const newLink = pipWindow.document.createElement("link");
          newLink.rel = "stylesheet";
          newLink.href = styleSheet.href;
          pipWindow.document.head.appendChild(newLink);
        }
      } catch (e) {
        const link = pipWindow.document.createElement("link");
        link.rel = "stylesheet";
        link.href = styleSheet.href;
        pipWindow.document.head.appendChild(link);
      }
    });

    // Set PiP Body Styles
    pipWindow.document.body.style.background = "#121212";
    pipWindow.document.body.style.display = "flex";
    pipWindow.document.body.style.flexDirection = "column";
    pipWindow.document.body.style.margin = "0";
    pipWindow.document.body.className = "pip-window";

    // INJECT HEADER IF COMBAT METER
    if (elementId === "meter-split-container") {
      const header = pipWindow.document.createElement("div");
      header.className = "pip-header";
      header.innerHTML = `
                <div id="pip-tab-damage" class="pip-tab ${
                  activeMeterMode === "damage" ? "active-dmg" : ""
                }" onclick="switchMeterMode('damage')">
                    <img src="./img/headers/damage.png" class="tab-icon">
                    <span>DMG</span>
                </div>
                <div id="pip-tab-healing" class="pip-tab ${
                  activeMeterMode === "healing" ? "active-heal" : ""
                }" onclick="switchMeterMode('healing')">
                    <img src="./img/headers/healing.png" class="tab-icon">
                    <span>HEALING</span>
                </div>
                <div id="pip-tab-armor" class="pip-tab ${
                  activeMeterMode === "armor" ? "active-armor" : ""
                }" onclick="switchMeterMode('armor')">
                    <img src="./img/headers/armor.png" class="tab-icon">
                    <span>ARMOR</span>
                </div>
            `;
      pipWindow.document.body.appendChild(header);
    }

    // Move the element into the PiP window
    const parent = playerElement.parentElement;
    const placeholder = document.createElement("div");
    placeholder.id = elementId + "-placeholder";
    placeholder.className = "empty-state";
    placeholder.textContent = "Viewing in Picture-in-Picture mode...";

    const originalParent = parent;
    parent.replaceChild(placeholder, playerElement);
    playerElement.classList.add("pip-active");
    pipWindow.document.body.appendChild(playerElement);

    // Handle closing
    pipWindow.addEventListener("pagehide", () => {
      pipWindow = null;
      playerElement.classList.remove("pip-active");
      const currentPlaceholder = document.getElementById(
        elementId + "-placeholder"
      );
      if (currentPlaceholder) {
        originalParent.replaceChild(playerElement, currentPlaceholder);
      }
      renderMeter();
      renderTracker();
      if (elementId === "chat-list") chatList.scrollTop = chatList.scrollHeight;
    });

    // Force renders
    renderMeter();
    renderTracker();
  } catch (err) {
    console.error("Failed to open PiP window:", err);
  }
}

function openTrackerModal(itemId) {
  const item = trackedItems.find((t) => t.id === itemId);
  if (!item) return;

  const modal = document.getElementById("tracker-modal");

  // MAIN ITEM ICON: Pointing to Local Folder img/items/
  const itemIconPath =
    item.profession === "ALL" && item.imgId
      ? `img/items/${item.imgId}.png`
      : `img/resources/${item.name.replace(/\s+/g, "_")}.png`;

  document.getElementById("modal-item-name").textContent = item.name;
  const modalIcon = document.getElementById("modal-item-icon");
  modalIcon.src = itemIconPath;

  modalIcon.onerror = function () {
    this.src = "img/resources/not_found.png";
    this.onerror = null;
  };

  document.getElementById("modal-input-current").value = item.current;
  document.getElementById("modal-input-target").value = item.target;

  document.getElementById("modal-save-btn").onclick = () => {
    const newCur =
      parseInt(document.getElementById("modal-input-current").value) || 0;
    const newTar =
      parseInt(document.getElementById("modal-input-target").value) || 0;
    updateItemValue(item.id, "current", newCur);
    updateItemValue(item.id, "target", newTar);
    closeTrackerModal();
  };

  document.getElementById("modal-delete-btn").onclick = () => {
    if (confirm(`Stop tracking ${item.name}?`)) {
      removeTrackedItem(item.id);
      closeTrackerModal();
    }
  };

  modal.style.display = "flex";
}

function closeTrackerModal() {
  document.getElementById("tracker-modal").style.display = "none";
}

// ==========================================
// DISCORD EXPORT LOGIC
// ==========================================
function exportToDiscord() {
  let dataSet;
  let title;

  // Determine what to export based on active tab
  if (activeMeterMode === "damage") {
    dataSet = fightData;
    title = "DAMAGE REPORT";
  } else if (activeMeterMode === "healing") {
    dataSet = healData;
    title = "HEALING REPORT";
  } else {
    dataSet = armorData;
    title = "ARMOR REPORT";
  }

  const players = Object.values(dataSet);
  if (players.length === 0) return alert("No data to export.");

  // Separate Allies vs Enemies
  const allies = [];
  const enemies = [];
  players.forEach((p) => {
    if (isPlayerAlly(p)) allies.push(p);
    else enemies.push(p);
  });

  // Sort High to Low
  allies.sort((a, b) => b.total - a.total);
  enemies.sort((a, b) => b.total - a.total);

  // Calculate Totals
  const totalAlly = allies.reduce((acc, p) => acc + p.total, 0);
  const totalEnemy = enemies.reduce((acc, p) => acc + p.total, 0);

  // Formatters
  const formatNum = (num) => num.toLocaleString();
  const getPercent = (val, total) =>
    total > 0 ? Math.round((val / total) * 100) + "%" : "0%";

  // Build String (Markdown Code Block for Discord)
  let report = `\`\`\`ini\n[ ${title} ]\n`;
  report += `Total: ${formatNum(totalAlly)} (Allies) vs ${formatNum(
    totalEnemy
  )} (Enemies)\n\n`;

  if (allies.length > 0) {
    report += `[ ALLIES ]\n`;
    allies.forEach((p, i) => {
      // Limit to top 15 to avoid hitting Discord char limits
      if (i < 15) {
        // Formatting: 1. Name..... : 1,200,000 (45%)
        report += `${i + 1}. ${p.name.padEnd(15)} : ${formatNum(p.total).padEnd(
          10
        )} (${getPercent(p.total, totalAlly)})\n`;
      }
    });
    if (allies.length > 15) report += `... (+${allies.length - 15} more)\n`;
    report += `\n`;
  }

  if (enemies.length > 0) {
    report += `[ ENEMIES ]\n`;
    enemies.forEach((p, i) => {
      if (i < 10) {
        report += `${i + 1}. ${p.name.padEnd(15)} : ${formatNum(p.total).padEnd(
          10
        )}\n`;
      }
    });
  }

  report += `\`\`\``;

  // Copy to Clipboard with Visual Feedback
  navigator.clipboard
    .writeText(report)
    .then(() => {
      const btn = document.getElementById("discordBtn");
      const originalText = btn.textContent;
      btn.textContent = "✅"; // Change icon to checkmark
      btn.style.color = "#2ecc71"; // Green

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.color = ""; // Reset color
      }, 1500);
    })
    .catch((err) => {
      console.error("Export failed", err);
      alert("Failed to copy to clipboard.");
    });
}

// INITIALIZATION
// Update timer every minute
setInterval(updateDailyTimer, 60000);
updateDailyTimer();
updateWatchdogUI();
