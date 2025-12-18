// ==========================================
// CONFIG & STATE
// ==========================================
let fileHandle, fileOffset = 0, isReading = false;
let parseIntervalId = null, watchdogIntervalId = null;

// Global function to handle the toggle and save state
window.toggleIconVariant = function(playerName, imgEl) {
    // 1. Toggle State
    playerVariantState[playerName] = !playerVariantState[playerName];
    
    // 2. Get Class Name
    const className = playerClasses[playerName];
    if (!className) return;

    // 3. Update Image Source Immediately
    const newSrc = playerVariantState[playerName] ? `./img/classes/${className}-f.png` : `./img/classes/${className}.png`;
    imgEl.src = newSrc;
    
    // 4. Clear Cache (So the next re-render generates the correct version)
    delete playerIconCache[playerName];
};

// Combat State
let fightData = {}; // Damage
let healData = {};  // Healing
let armorData = {}; // Armor
let playerClasses = {}; // Map player Name -> Class Icon Filename
let playerIconCache = {}; // Cache for icon HTML strings to avoid re-calc
let playerVariantState = {}; // Stores true/false for gender toggle
let manualOverrides = {}; // Map player Name -> 'ally' | 'enemy'
let activeMeterMode = 'damage'; // 'damage', 'healing', 'armor'
let currentCaster = "Unknown"; 
let currentSpell = "Unknown Spell";
let expandedPlayers = new Set();
let isAutoResetOn = false;
let lastCombatTime = Date.now();
let resetDelayMs = 120000;

// Spell Map (Built at runtime)
let spellToClassMap = {};

// Chat State
const translationQueue = [];
let isTranslating = false;
const transConfig = { pt: true, fr: true, es: false, others: false, enabled: true };
let currentChatFilter = 'all';

// Item Tracker State
let trackedItems = []; 

// ELEMENTS
const setupPanel = document.getElementById('setup-panel');
const dropZone = document.getElementById('drop-zone');
const activeFilename = document.getElementById('active-filename');
const liveIndicator = document.getElementById('live-indicator');
const chatList = document.getElementById('chat-list');
const autoResetBtn = document.getElementById('autoResetToggle');
const autoResetText = document.getElementById('autoResetText');
const timerInput = document.getElementById('timerInput');
const clearChatBtn = document.getElementById('clearChatBtn');

// Setup Reconnect Elements
const reconnectContainer = document.getElementById('reconnect-container');
const reconnectBtn = document.getElementById('reconnect-btn');
const newFileBtn = document.getElementById('new-file-btn');
const prevFilenameEl = document.getElementById('prev-filename');

// Copy Button Element
const copyPathBtn = document.getElementById('copy-path-btn');
const logPathEl = document.getElementById('log-path');

// Item Tracker Elements
const profSelect = document.getElementById('prof-select');
const itemInput = document.getElementById('item-input');
const itemDatalist = document.getElementById('item-datalist');
const trackerList = document.getElementById('tracker-list');
let dragSrcIndex = null;

// ==========================================
// INITIALIZATION & DRAG/DROP SETUP
// ==========================================
generateSpellMap();
renderMeter();
updateButtonText();
initTrackerDropdowns();
setupDragAndDrop();

// Check for previous file immediately on load
document.addEventListener('DOMContentLoaded', () => {
    checkPreviousFile();
    initForecast(); // Initialize Forecast system
});

// MODIFIED: Drop Zone handles BOTH Log files and CSV files
dropZone.addEventListener('dragover', (e) => e.preventDefault());
dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    
    if (items && items[0] && items[0].kind === 'file') {
        try {
            const handle = await items[0].getAsFileSystemHandle();
            
            // CHECK FILE TYPE
            if (handle.name.toLowerCase().endsWith('.csv')) {
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
    reconnectBtn.addEventListener('click', async () => {
        const handle = await getSavedHandle();
        if (handle) {
            // Browser requires permission verification on new session
            const opts = { mode: 'read' };
            try {
                // queryPermission might return 'prompt' or 'granted'
                // We request it if it's not granted
                if ((await handle.queryPermission(opts)) === 'granted' || (await handle.requestPermission(opts)) === 'granted') {
                    fileHandle = handle;
                    await startTracking(fileHandle);
                } else {
                    alert("Permission denied. Please select the file again.");
                    reconnectContainer.style.display = 'none';
                    dropZone.style.display = 'block';
                }
            } catch (e) {
                console.error("Permission error:", e);
                // If the handle is stale, force new selection
                reconnectContainer.style.display = 'none';
                dropZone.style.display = 'block';
            }
        }
    });
}

if (newFileBtn) {
    newFileBtn.addEventListener('click', () => {
        reconnectContainer.style.display = 'none';
        dropZone.style.display = 'block';
    });
}

// COPY PATH LOGIC
if(copyPathBtn && logPathEl) {
    copyPathBtn.addEventListener('click', () => {
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
    if (typeof classSpells === 'undefined') return;
    spellToClassMap = {};
    
    // Iterate over each class (e.g., "feca", "iop")
    for (const [className, langData] of Object.entries(classSpells)) {
        // Handle the new structure: Object with languages { en: [], fr: [] }
        if (typeof langData === 'object' && !Array.isArray(langData)) {
            // Iterate over each language array
            for (const spells of Object.values(langData)) {
                if (Array.isArray(spells)) {
                    spells.forEach(spell => {
                        spellToClassMap[spell] = className;
                    });
                }
            }
        } 
        // Fallback for flat structure if data is mixed (e.g. array of strings)
        else if (Array.isArray(langData)) {
            langData.forEach(spell => {
                spellToClassMap[spell] = className;
            });
        }
    }
}

function setupDragAndDrop() {
    const alliesList = document.getElementById('list-allies');
    const enemiesList = document.getElementById('list-enemies');

    [alliesList, enemiesList].forEach(list => {
        list.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            list.classList.add('drag-over');
        });
        
        list.addEventListener('dragleave', (e) => {
            list.classList.remove('drag-over');
        });
        
        list.addEventListener('drop', (e) => {
            e.preventDefault();
            list.classList.remove('drag-over');
            const playerName = e.dataTransfer.getData('text/plain');
            if (!playerName) return;

            const targetType = (list.id === 'list-allies') ? 'ally' : 'enemy';
            
            // Set Manual Override
            manualOverrides[playerName] = targetType;
            renderMeter();
        });
    });
}

// ==========================================
// INDEXED DB (PERSISTENCE) - FIXED
// ==========================================
const DB_NAME = 'WakfuNexusDB';
const DB_VERSION = 2; // Bumped version to ensure schema update if needed
const STORE_NAME = 'fileHandles';

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
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        // Return a promise that resolves when the transaction completes
        return new Promise((resolve, reject) => {
            const req = store.put(handle, 'activeLog');
            
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
    } catch(e) {
        console.error("Failed to save handle:", e);
    }
}

async function getSavedHandle() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get('activeLog');
            
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch(e) { 
        console.error("Error getting handle:", e);
        return null; 
    }
}

async function checkPreviousFile() {
    const handle = await getSavedHandle();
    if (handle) {
        if(dropZone) dropZone.style.display = 'none';
        if(reconnectContainer) {
            reconnectContainer.style.display = 'block';
            if(prevFilenameEl) prevFilenameEl.textContent = handle.name;
        }
    }
}

// ==========================================
// ITEM TRACKER LOGIC
// ==========================================
function initTrackerDropdowns() {
    if (typeof professionItems === 'undefined') return;
    for (const prof in professionItems) {
        const opt = document.createElement('option');
        opt.value = prof;
        opt.textContent = prof;
        profSelect.appendChild(opt);
    }
    loadTrackerState();
}

function updateItemDropdown() {
    const prof = profSelect.value;
    
    // Clear input and datalist
    itemInput.value = "";
    itemDatalist.innerHTML = "";
    
    if (professionItems[prof]) {
        professionItems[prof].forEach(itemData => {
            const opt = document.createElement('option');
            // Datalist uses 'value' for the text displayed in the dropdown
            opt.value = itemData.name;
            itemDatalist.appendChild(opt);
        });
    }
}

// --- Persistence Helpers ---
function saveTrackerState() {
    localStorage.setItem('wakfu_tracker_data', JSON.stringify(trackedItems));
}

function loadTrackerState() {
    const data = localStorage.getItem('wakfu_tracker_data');
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
    const currentProf = profSelect.value;
    const itemName = itemInput.value.trim();

    if (!currentProf) {
        alert("Please select a profession first.");
        return;
    }
    if (!itemName) {
        alert("Please select or search for an item.");
        return;
    }

    // Validate the item actually exists in the selected profession
    // (Since inputs allow typing anything)
    const itemData = professionItems[currentProf].find(i => i.name.toLowerCase() === itemName.toLowerCase());
    
    if (!itemData) {
        alert(`"${itemName}" is not a valid item for ${currentProf}. Please select from the list.`);
        return;
    }

    // Check for duplicates
    if (trackedItems.find(t => t.name === itemData.name)) { 
        alert("Already tracking " + itemData.name); 
        // Clear input for convenience
        itemInput.value = "";
        return; 
    }
    
    // Prompt for Target
    let target = prompt("Target quantity?", "500");
    if (target === null) return; // User cancelled
    target = parseInt(target) || 500;

    trackedItems.push({
        id: Date.now(),
        name: itemData.name,
        current: 0,
        target: target,
        level: itemData.level,
        rarity: itemData.rarity,
        profession: currentProf
    });
    
    // Clear input after adding
    itemInput.value = "";
    
    saveTrackerState(); 
    renderTracker();
}

function removeTrackedItem(id) {
    trackedItems = trackedItems.filter(t => t.id !== id);
    saveTrackerState(); 
    renderTracker();
}

function updateItemValue(id, key, val) {
    const item = trackedItems.find(t => t.id === id);
    if (item) {
        item[key] = parseInt(val) || 0;
        saveTrackerState(); 
        renderTracker();
    }
}

function renderTracker() {
    trackerList.innerHTML = "";
    if (trackedItems.length === 0) {
        trackerList.innerHTML = '<div class="empty-state">Add items to track</div>';
        return;
    }

    trackedItems.forEach((item, index) => {
        const isComplete = item.current >= item.target && item.target > 0;
        const row = document.createElement('div');
        row.className = `tracked-item-row ${isComplete ? 'complete' : ''}`;
        
        // --- DRAG & DROP SETUP ---
        row.setAttribute('draggable', 'true');
        row.dataset.index = index;
        
        row.addEventListener('dragstart', handleTrackDragStart);
        row.addEventListener('dragenter', handleTrackDragEnter);
        row.addEventListener('dragover', handleTrackDragOver);
        row.addEventListener('dragleave', handleTrackDragLeave);
        row.addEventListener('drop', handleTrackDrop);
        row.addEventListener('dragend', handleTrackDragEnd);
        // -------------------------
        
        // Image Path Logic
        const safeItemName = item.name.replace(/\s+/g, '_');
        const rarityName = (item.rarity || 'common').toLowerCase();
        const profIconName = (item.profession || 'miner').toLowerCase().replace(' ', '_');
        
        // NEW INLINE HTML STRUCTURE
        row.innerHTML = `
            <div class="t-left-group">
                <img src="img/resources/${safeItemName}.png" class="resource-icon" 
                     onerror="this.src='img/resources/${safeItemName}.webp'; this.onerror=function(){this.style.display='none'};">
                <div class="t-info-text">
                        <img src="img/quality/${rarityName}.png" class="rarity-icon" title="${item.rarity}" onerror="this.style.display='none'">
                        <span class="t-level-badge">Lvl. ${item.level}</span>
                        <span class="t-item-name">${item.name}</span>
                </div>
            </div>
            
            <div class="t-input-container">
                <input type="number" class="t-input" value="${item.current}" 
                    onchange="updateItemValue(${item.id}, 'current', this.value)">
                <span class="t-separator">/</span>
                <input type="number" class="t-input" value="${item.target}" 
                    onchange="updateItemValue(${item.id}, 'target', this.value)">
            </div>

            <div class="t-right-group">
                <img src="img/jobs/${profIconName}.png" class="t-job-icon" onerror="this.style.display='none'">
                <div class="t-status-col">
                    <button class="t-delete-btn" onclick="removeTrackedItem(${item.id})">×</button>
                    <span class="t-progress-text">${Math.floor((item.current / (item.target || 1)) * 100)}%</span>
                </div>
            </div>
        `;
        trackerList.appendChild(row);
    });
}

// --- Drag & Drop Handlers ---

function handleTrackDragStart(e) {
    this.classList.add('dragging');
    dragSrcIndex = this.dataset.index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIndex);
}

function handleTrackDragOver(e) {
    if (e.preventDefault) e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleTrackDragEnter(e) {
    // Only highlight if we are entering a different row than the one we are dragging
    if (this.dataset.index !== dragSrcIndex) {
        this.classList.add('drag-over');
    }
}

function handleTrackDragLeave(e) {
    this.classList.remove('drag-over');
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
    this.classList.remove('dragging');
    const rows = document.querySelectorAll('.tracked-item-row');
    rows.forEach(row => row.classList.remove('drag-over'));
    dragSrcIndex = null;
}

function processItemLog(line) {
    const match = line.match(/You have picked up (\d+)x (.*?) \./i);
    if (match) {
        const qty = parseInt(match[1], 10);
        const rawName = match[2].trim().toLowerCase();
        let updated = false;
        trackedItems.forEach(item => {
            const trackNameLower = item.name.toLowerCase();
            if (trackNameLower.includes(rawName) || rawName.includes(trackNameLower)) {
                item.current += qty;
                updated = true;
                showTrackerNotification(qty, item.name);
            }
        });
        if (updated) { saveTrackerState(); renderTracker(); }
    }
}

function showTrackerNotification(qty, itemName) {
    const container = document.getElementById('tracker-notifications');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'tracker-toast';
    toast.textContent = `Picked up ${qty}x ${itemName}`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
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
    if (!transConfig.enabled) { translationQueue.length = 0; isTranslating = false; }
    updateLangButtons();
}

function updateLangButtons() {
    document.getElementById('btnPT').classList.toggle('active', transConfig.pt && transConfig.enabled);
    document.getElementById('btnFR').classList.toggle('active', transConfig.fr && transConfig.enabled);
    document.getElementById('btnES').classList.toggle('active', transConfig.es && transConfig.enabled);
    document.getElementById('btnOther').classList.toggle('active', transConfig.others && transConfig.enabled);
    
    const btnMaster = document.getElementById('btnMaster');
    if (transConfig.enabled) {
        btnMaster.className = 'lang-btn master-on';
        btnMaster.textContent = "ENABLED";
    } else {
        btnMaster.className = 'lang-btn master-off';
        btnMaster.textContent = "DISABLED";
    }
}

// ==========================================
// CORE LOGIC
// ==========================================
async function startTracking(handle) {
    // Save to DB for next time (AWAIT ensures it saves before continuing)
    await saveFileHandleToDB(handle);

    document.getElementById('setup-panel').style.display = 'none';
    activeFilename.textContent = handle.name;
    liveIndicator.style.display = 'inline-block';
    
    performReset(true);
    chatList.innerHTML = '<div class="empty-state">Waiting for chat logs...</div>';
    
    try {
        const file = await handle.getFile();
        fileOffset = file.size; 
    } catch (e) { fileOffset = 0; }

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
            lines.forEach(processLine);
            fileOffset = file.size;
            renderMeter();
        }
    } catch (err) { console.error(err); } 
    finally { isReading = false; }
}

function processLine(line) {
    if (!line) return;
    if (line.includes("You have picked up")) processItemLog(line);
    if (line.includes("[Game Log]")) return;
    if (line.includes("[Fight Log]")) { processFightLog(line); return; }
    if (line.match(/^\d{2}:\d{2}:\d{2}/)) processChatLog(line);
}

// ==========================================
// COMBAT METER LOGIC (DMG & HEAL & ARMOR)
// ==========================================
function switchMeterMode(mode) {
    activeMeterMode = mode;
    document.getElementById('tab-damage').classList.toggle('active', mode === 'damage');
    document.getElementById('tab-healing').classList.toggle('active', mode === 'healing');
    document.getElementById('tab-armor').classList.toggle('active', mode === 'armor');
    renderMeter();
}

function detectClass(playerName, spellName) {
    // 1. Enemy Check: If name is in wakfuEnemies, ignore spell-based class detection.
    if (typeof wakfuEnemies !== 'undefined' && wakfuEnemies.some(e => playerName.includes(e))) {
        return; 
    }

    // 2. Class Check based on Spells
    if (spellToClassMap[spellName]) {
        const detected = spellToClassMap[spellName];
        
        // Update if not set or different
        if (playerClasses[playerName] !== detected) {
            playerClasses[playerName] = detected;
            // Clear cache for this player so icon updates
            delete playerIconCache[playerName];
        }
    }
}

function processFightLog(line) {
    const content = line.split("[Fight Log] ")[1].trim();
    const castMatch = content.match(/^(.*?) casts (.*?)(?:\.|\s\(|$)/);
    
    if (castMatch) {
        currentCaster = castMatch[1].trim();
        currentSpell = castMatch[2].trim();
        detectClass(currentCaster, currentSpell);
        return;
    }

    // ARMOR PARSING
    // Pattern: Player: X Armor (Source)
    const armorMatch = content.match(/^(.*?): ([\d,\s]+) Armor(?: \((.*?)\))?/);
    if (armorMatch) {
        let player = armorMatch[1];
        let amount = parseInt(armorMatch[2].replace(/[,.\s]/g, ''), 10);
        let source = armorMatch[3] || "Unknown Source";
        
        if (!isNaN(amount) && amount > 0) {
            updateCombatData(armorData, player, source, amount, null);
            lastCombatTime = Date.now();
            updateWatchdogUI();
        }
        return;
    }

    // HEALING
    if (content.includes("+") && content.includes("HP")) {
        const healMatch = content.match(/^(.*?): \+([\d,\s]+) HP(.*)$/);
        if (healMatch) {
            let player = healMatch[1];
            let amount = parseInt(healMatch[2].replace(/[,.\s]/g, ''), 10);
            let remainder = healMatch[3].trim(); // e.g. "(Neutral) (Critical Hit Expert)" or "(Fire)"
            
            if (!isNaN(amount) && amount > 0) {
                let element = null;
                let actualSpell = currentSpell; // Default to last cast spell

                // Parse Element and Optional Source from remainder
                // Expected formats: "(Fire)" or "(Neutral) (Critical Hit Expert)"
                const detailsMatch = remainder.match(/^\((.+?)\)(?: \((.+?)\))?$/);
                if (detailsMatch) {
                    element = detailsMatch[1]; // e.g. "Neutral"
                    if (detailsMatch[2]) {
                        actualSpell = detailsMatch[2]; // e.g. "Critical Hit Expert" overrides cast spell
                    }
                }

                updateCombatData(healData, currentCaster, actualSpell, amount, element);
                lastCombatTime = Date.now();
                updateWatchdogUI();
            }
            return; 
        }
    }

    // DAMAGE
    const dmgMatch = content.match(/^(.*?): -([\d,\s]+) HP.*?\((.*?)\)/);
    if (dmgMatch) {
        let amount = parseInt(dmgMatch[2].replace(/[,.\s]/g, ''), 10);
        let element = dmgMatch[3]; 
        if (!isNaN(amount)) {
            updateCombatData(fightData, currentCaster, currentSpell, amount, element);
            lastCombatTime = Date.now();
            updateWatchdogUI();
        }
        return;
    } 
    const simpleDmgMatch = content.match(/^(.*?): -([\d,\s]+) HP/);
    if (simpleDmgMatch) {
        let amount = parseInt(simpleDmgMatch[2].replace(/[,.\s]/g, ''), 10);
        if (!isNaN(amount)) {
            updateCombatData(fightData, currentCaster, currentSpell, amount, null);
            lastCombatTime = Date.now();
            updateWatchdogUI();
        }
        return;
    }
}

function updateCombatData(dataSet, player, spell, amount, element) {
    if (!dataSet[player]) dataSet[player] = { name: player, total: 0, spells: {} };
    dataSet[player].total += amount;
    
    const spellKey = `${spell}|${element || 'neutral'}`;
    if (!dataSet[player].spells[spellKey]) {
        dataSet[player].spells[spellKey] = { val: 0, element: element, realName: spell };
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
    if (activeMeterMode === 'damage') dataSet = fightData;
    else if (activeMeterMode === 'healing') dataSet = healData;
    else dataSet = armorData;

    Object.keys(dataSet).forEach(name => expandedPlayers.add(name));
    renderMeter();
}

function collapseAll() {
    expandedPlayers.clear();
    renderMeter();
}

// Helper: Determine if a player object belongs to Allies or Enemies
function isPlayerAlly(p) {
    // 1. Manual Override
    if (manualOverrides[p.name]) {
        return manualOverrides[p.name] === 'ally';
    }
    // 2. Logic Detection
    const hasClass = !!playerClasses[p.name];
    const isSummon = typeof allySummons !== 'undefined' && allySummons.includes(p.name);
    const isEnemyDB = typeof wakfuEnemies !== 'undefined' && wakfuEnemies.some(fam => p.name.includes(fam));

    if (hasClass || isSummon) return true;
    if (isEnemyDB) return false;
    
    return false; // Default to Enemy for unknowns
}

// New Function: Expand or Collapse specific category
function modifyExpansion(category, action) {
    let dataSet;
    if (activeMeterMode === 'damage') dataSet = fightData;
    else if (activeMeterMode === 'healing') dataSet = healData;
    else dataSet = armorData;

    const players = Object.values(dataSet);
    
    players.forEach(p => {
        const isAlly = isPlayerAlly(p);
        
        // Check if player belongs to the category we are modifying
        if ((category === 'allies' && isAlly) || (category === 'enemies' && !isAlly)) {
            if (action === 'expand') {
                expandedPlayers.add(p.name);
            } else {
                expandedPlayers.delete(p.name);
            }
        }
    });
    renderMeter();
}

function performReset() {
    fightData = {};
    healData = {};
    armorData = {}; 
    playerClasses = {}; 
    playerIconCache = {}; 
    playerVariantState = {}; // Reset gender toggles
    manualOverrides = {}; 
    currentCaster = "Unknown";
    currentSpell = "Unknown Spell";
    renderMeter();
    updateWatchdogUI();
}

document.getElementById('resetBtn').addEventListener('click', performReset);

// ==========================================
// RENDER METER
// ==========================================
function renderMeter() {
    let dataSet;
    if (activeMeterMode === 'damage') dataSet = fightData;
    else if (activeMeterMode === 'healing') dataSet = healData;
    else dataSet = armorData;

    const players = Object.values(dataSet);
    
    const alliesContainer = document.getElementById('list-allies');
    const enemiesContainer = document.getElementById('list-enemies');
    const alliesTotalEl = document.getElementById('allies-total-val');
    const enemiesTotalEl = document.getElementById('enemies-total-val');

    if (players.length === 0) {
        alliesContainer.innerHTML = `<div class="empty-state">Waiting for combat...</div>`;
        enemiesContainer.innerHTML = "";
        alliesTotalEl.textContent = "0";
        enemiesTotalEl.textContent = "0";
        return;
    }

    const allies = [];
    const enemies = [];

    players.forEach(p => {
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
        if(list.length === 0) {
            container.innerHTML = '<div style="padding:10px;color:#555;font-style:italic;text-align:center;">None</div>';
            return;
        }

        const maxVal = list[0].total; 

        list.forEach(p => {
            const barPercent = (p.total / maxVal) * 100; 
            const totalPercent = (categoryTotal > 0) ? ((p.total / categoryTotal) * 100).toFixed(1) + "%" : "0.0%";
            const isExpanded = expandedPlayers.has(p.name);
            
            // --- ICON OPTIMIZATION ---
            let iconHtml = playerIconCache[p.name];

            if (!iconHtml) {
                const classIconName = playerClasses[p.name];
                
                if (classIconName) {
                    // Check persistent state for gender
                    const isAlt = playerVariantState[p.name]; 
                    const currentSrc = isAlt ? `./img/classes/${classIconName}-f.png` : `./img/classes/${classIconName}.png`;

                    // Generate HTML with persistent toggle handler
                    iconHtml = `<img src="${currentSrc}" 
                                     class="class-icon" 
                                     title="${classIconName}" 
                                     onmouseover="toggleIconVariant('${p.name.replace(/'/g, "\\'")}', this)" 
                                     onerror="this.src='./img/classes/not_found.png'; this.onerror=null;">`;
                } else {
                    // Creature logic
                    const safeName = p.name.replace(/\s+/g, '_');
                    iconHtml = `<img src="./img/creatures/100px-${safeName}.png" class="class-icon" onerror="this.src='./img/classes/not_found.png'; this.onerror=null;">`;
                }
                
                playerIconCache[p.name] = iconHtml;
            }
            // --- END ICON OPTIMIZATION ---
            
            // --- DRAG & DROP SETUP ---
            // -------------------------
    
            const rowBlock = document.createElement('div');
            rowBlock.className = `player-block ${isExpanded ? 'expanded' : ''}`;
            rowBlock.setAttribute('draggable', 'true');
            
            rowBlock.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', p.name);
                rowBlock.style.opacity = '0.5';
            });
            rowBlock.addEventListener('dragend', (e) => {
                rowBlock.style.opacity = '1';
            });
            
            let barClass, textClass;
            if (activeMeterMode === 'damage') {
                barClass = 'damage-bar'; textClass = 'damage-text';
            } else if (activeMeterMode === 'healing') {
                barClass = 'healing-bar'; textClass = 'healing-text';
            } else {
                barClass = 'armor-bar'; textClass = 'armor-text';
            }
    
            const mainRow = document.createElement('div');
            mainRow.className = 'player-row';
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
                const spellContainer = document.createElement('div');
                spellContainer.className = 'spell-list open';
                
                const spells = Object.entries(p.spells).map(([key, data]) => ({ 
                    key, 
                    val: data.val, 
                    element: data.element,
                    realName: data.realName || key.split('|')[0] 
                })).sort((a, b) => b.val - a.val);
                
                spells.forEach(s => {
                    const spellBarPercent = (s.val / p.total) * 100; 
                    const spellContribPercent = (p.total > 0) ? ((s.val / p.total) * 100).toFixed(1) + "%" : "0.0%";
    
                    const spellRow = document.createElement('div');
                    spellRow.className = 'spell-row';
                    
                    const validElements = ['Fire', 'Water', 'Earth', 'Air', 'Stasis', 'Light'];
                    let iconName = 'neutral';
                    if (s.element && validElements.includes(s.element)) {
                        iconName = s.element.toLowerCase();
                    }
                    const iconHtml = `<img src="./img/elements/${iconName}.png" class="spell-icon" onerror="this.src='./img/elements/neutral.png'">`;
    
                    spellRow.innerHTML = `
                        <div class="spell-bg-bar" style="width: ${spellBarPercent}%"></div>
                        <div class="spell-info">
                            ${iconHtml}
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
    "Vicinity": "#cccccc", "Private": "#00e1ff", "Group": "#aa66ff", "Guild": "#ffaa00",
    "Trade": "#dd7700", "Politics": "#ffff00", "PvP": "#00aaaa", 
    "Community": "#3366ff", "Recruitment": "#ff2255", "Default": "#888888"
};

function getChannelColor(channelName) {
    if (channelName.includes("Vicinity")) return CHAT_COLORS.Vicinity;
    if (channelName.includes("Private") || channelName.includes("Whisper")) return CHAT_COLORS.Private;
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
    const [hours, mins] = rawTimeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(mins), 0);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function processChatLog(line) {
    const parts = line.split(" - ");
    if (parts.length < 2) return;
    const localTime = formatLocalTime(parts[0].split(",")[0]); 
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
        } else { message = contentAfter; }
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
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btnId = 'filter' + (filter === 'all' ? 'ALL' : (filter === 'recruitment' ? 'RECRUIT' : filter === 'community' ? 'COMM' : filter.toUpperCase()));
    const activeBtn = document.getElementById(btnId);
    if(activeBtn) activeBtn.classList.add('active');

    const messages = document.querySelectorAll('.chat-msg');
    messages.forEach(msg => {
        const cat = msg.getAttribute('data-category');
        if (cat === 'vicinity' || cat === 'private') {
            msg.style.display = 'block';
        } else if (currentChatFilter === 'all') {
            msg.style.display = 'block';
        } else {
            if (cat === currentChatFilter) msg.style.display = 'block';
            else msg.style.display = 'none';
        }
    });
    chatList.scrollTop = chatList.scrollHeight;
}

function getCategoryFromChannel(channelName) {
    const lower = channelName.toLowerCase();
    if (lower.includes('vicinity')) return 'vicinity';
    if (lower.includes('private') || lower.includes('whisper')) return 'private';
    if (lower.includes('group')) return 'group';
    if (lower.includes('guild')) return 'guild';
    if (lower.includes('trade')) return 'trade';
    if (lower.includes('community')) return 'community';
    if (lower.includes('recruitment')) return 'recruitment';
    return 'other'; 
}

function addChatMessage(time, channel, author, message) {
    const emptyState = chatList.querySelector('.empty-state');
    if (emptyState) {
        chatList.innerHTML = '';
    }

    const div = document.createElement('div');
    div.className = 'chat-msg';
    const category = getCategoryFromChannel(channel);
    div.setAttribute('data-category', category); 

    if (currentChatFilter !== 'all' && category !== 'vicinity' && category !== 'private' && category !== currentChatFilter) {
        div.style.display = 'none';
    }

    const transId = 'trans-' + Date.now() + '-' + Math.floor(Math.random()*1000);
    const color = getChannelColor(channel);
    const channelTag = `[${channel}]`;

    div.innerHTML = `
        <div class="chat-meta">
            <span class="chat-time">${time}</span>
            <span class="chat-channel" style="color:${color}">${channelTag}</span>
            <span class="chat-author" style="color:${color}">${author}</span>
            <button class="manual-trans-btn" onclick="queueTranslation('${message.replace(/'/g, "\\'")}', '${transId}', true)">T</button>
        </div>
        <div class="chat-content">${message}</div>
        <div id="${transId}" class="translated-block" style="display:none;"></div>
    `;
    
    chatList.appendChild(div);
    chatList.scrollTop = chatList.scrollHeight;

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
                    if (transConfig.pt && (l === 'pt' || l.startsWith('pt-'))) show = true;
                    else if (transConfig.fr && (l === 'fr' || l.startsWith('fr-'))) show = true;
                    else if (transConfig.es && (l === 'es' || l.startsWith('es-'))) show = true;
                    else if (l === 'en' || l.startsWith('en-')) show = false; 
                    else if (transConfig.others) {
                        if (!l.startsWith('pt') && !l.startsWith('fr') && !l.startsWith('es')) show = true;
                    }
                }

                if (show) {
                    const el = document.getElementById(item.elementId);
                    if (el) {
                        el.style.display = 'flex';
                        el.innerHTML = `<span class="trans-icon">文A</span> ${result.text}`;
                    }
                }
            }
        }
    } catch (e) { }

    isTranslating = false;
    setTimeout(processTranslationQueue, 50); 
}

async function fetchTranslation(text) {
    const sourceUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    try {
        const response = await fetch(sourceUrl);
        const data = await response.json();
        if (data) {
            const translatedText = data[0].map(x => x[0]).join(''); 
            const detectedLang = data[2]; 
            return { text: translatedText, lang: detectedLang };
        }
    } catch (e) { return null; }
    return null;
}

clearChatBtn.addEventListener('click', () => {
    chatList.innerHTML = '<div class="empty-state">Chat cleared</div>';
});

// ==========================================
// WATCHDOG (AUTO RESET)
// ==========================================
autoResetBtn.addEventListener('click', () => {
    isAutoResetOn = !isAutoResetOn;
    autoResetBtn.classList.toggle('active', isAutoResetOn);
    updateWatchdogUI();
});

timerInput.addEventListener('input', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 5) val = 5;
    resetDelayMs = val * 1000;
    updateWatchdogUI();
});

function startWatchdog() {
    if (watchdogIntervalId) clearInterval(watchdogIntervalId);
    watchdogIntervalId = setInterval(updateWatchdogUI, 500); 
}

function updateWatchdogUI() {
    const formatTime = (ms) => {
        const s = Math.ceil(ms / 1000);
        return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    };
    
    // Check if any data exists
    const hasData = Object.keys(fightData).length > 0 || Object.keys(healData).length > 0 || Object.keys(armorData).length > 0;

    if (!isAutoResetOn || !hasData) {
        autoResetText.textContent = `Auto Reset (${formatTime(resetDelayMs)})`;
        return;
    }
    const remaining = resetDelayMs - (Date.now() - lastCombatTime);
    if (remaining <= 0) {
        performReset();
        autoResetText.textContent = `Auto Reset (${formatTime(resetDelayMs)})`;
    } else {
        autoResetText.textContent = `Auto Reset (${formatTime(remaining)})`;
    }
}

function updateButtonText() {
    const s = parseInt(timerInput.value, 10);
    autoResetText.textContent = `Auto Reset (${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')})`;
}

// ==========================================
// FOOTER UTILITIES (Daily Timer)
// ==========================================

// DAILY RESET TIMER (Europe/Paris Timezone)
function updateDailyTimer() {
    const timerEl = document.getElementById('daily-val');
    if (!timerEl) return;

    // Get current time in Paris
    const now = new Date();
    // We use the Intl API to get the correct time in Paris handling DST automatically
    const parisTimeStr = now.toLocaleString("en-US", { timeZone: "Europe/Paris" });
    const parisDate = new Date(parisTimeStr);

    // Create a target date for "Tomorrow 00:00:00" in Paris time
    const nextMidnight = new Date(parisDate);
    nextMidnight.setHours(24, 0, 0, 0);

    const diffMs = nextMidnight - parisDate;

    // Convert to HH:MM
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

    const hStr = hours.toString().padStart(2, '0');
    const mStr = minutes.toString().padStart(2, '0');

    timerEl.textContent = `${hStr}:${mStr}`;
}

// SIDEBAR TOGGLE
function toggleSidebar() {
    const sidebar = document.getElementById('info-sidebar');
    sidebar.classList.toggle('open');
}

// Sidebar Section Toggle
function toggleSidebarSection(id) {
    const section = document.getElementById(id);
    if (section) {
        section.classList.toggle('collapsed');
    }
}

// ==========================================
// DUNGEON FORECAST SYSTEM (DB Version)
// ==========================================
let currentForecastDate = new Date(); 
let forecastViewMode = 'tab'; // 'tab' or 'grid'
let activeDungeonTab = 'classic'; // 'classic' or 'modular'

async function initForecast() {
    // Set current date based on Paris time
    const parisString = new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" });
    currentForecastDate = new Date(parisString);

    renderForecastUI();

    // Bind Global Buttons (Previous/Next)
    // We re-bind inside render usually, but static binds here are fine if elements exist
    const btnPrev = document.getElementById('fc-prev');
    const btnNext = document.getElementById('fc-next');
    if(btnPrev) btnPrev.onclick = () => changeForecastDay(-1);
    if(btnNext) btnNext.onclick = () => changeForecastDay(1);
}

// --- Navigation ---
function changeForecastDay(days) {
    currentForecastDate.setDate(currentForecastDate.getDate() + days);
    renderForecastUI();
}

function toggleForecastViewMode() {
    forecastViewMode = (forecastViewMode === 'tab') ? 'grid' : 'tab';
    renderForecastUI();
}

function setDungeonTab(tab) {
    activeDungeonTab = tab;
    renderForecastUI();
}

// --- Helpers ---
function getFormattedDate(dateObj) {
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    return `${d}/${m}/${y}`;
}

// --- Main Render Function ---
function renderForecastUI() {
    const displayDate = getFormattedDate(currentForecastDate);
    
    // Check if it is today
    const nowParis = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const isToday = (currentForecastDate.getDate() === nowParis.getDate() && 
                     currentForecastDate.getMonth() === nowParis.getMonth() &&
                     currentForecastDate.getFullYear() === nowParis.getFullYear());
    
    // 1. Update Header (Date + Toggle Button)
    const navContainer = document.querySelector('.forecast-nav');
    if(navContainer) {
        // Clear existing to prevent duplicate buttons if re-rendering
        navContainer.innerHTML = `
            <button id="fc-prev" style="background:#444; border:none; color:white; cursor:pointer; width:30px; height:30px; border-radius:4px;">&lt;</button>
            <span id="fc-date-display" style="font-weight: bold; color: var(--accent); flex-grow:1; text-align:center;">
                ${isToday ? `TODAY (${displayDate})` : displayDate}
            </span>
            <button id="fc-next" style="background:#444; border:none; color:white; cursor:pointer; width:30px; height:30px; border-radius:4px;">&gt;</button>
            <button class="forecast-view-btn" onclick="toggleForecastViewMode()" title="Switch View">
                ${forecastViewMode === 'tab' ? '⊞' : '☰'}
            </button>
        `;
        // Re-bind nav buttons
        document.getElementById('fc-prev').onclick = () => changeForecastDay(-1);
        document.getElementById('fc-next').onclick = () => changeForecastDay(1);
    }

    const contentEl = document.getElementById('forecast-content');
    
    // 2. Fetch Data
    const dungeons = typeof FORECAST_DB !== 'undefined' ? FORECAST_DB[displayDate] : null;

    if (!dungeons || dungeons.length === 0) {
        if(contentEl) contentEl.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">No data for this date.</div>';
        return;
    }

    // 3. Process Data
    const classic = dungeons.filter(d => d.type.startsWith('DJ'));
    const modular = dungeons.filter(d => d.type.startsWith('Modulox'));

    // Find Intersections
    const classicNames = new Set(classic.map(d => d.name));
    const modularNames = new Set(modular.map(d => d.name));
    const intersectedNames = new Set([...classicNames].filter(x => modularNames.has(x)));

    // 4. Render based on Mode
    if (forecastViewMode === 'grid') {
        renderGridView(contentEl, classic, modular, intersectedNames);
    } else {
        renderTabView(contentEl, classic, modular, intersectedNames);
    }
}

// --- View: Grid (Side-by-Side) ---
function renderGridView(container, classicList, modularList, intersections) {
    let html = `<div class="forecast-grid">`;
    html += renderGridColumn(classicList, "CLASSIC", "🎯", "type-classic", intersections);
    html += renderGridColumn(modularList, "MODULAR", "⚔️", "type-modular", intersections);
    html += `</div>`;
    container.innerHTML = html;
}

function renderGridColumn(list, title, emoji, typeClass, intersections) {
    let colHtml = `<div class="forecast-col">
        <div class="forecast-subsection-header">
            <div class="header-left"><span>${emoji} ${title}</span></div>
        </div>
        <div class="forecast-subsection-content" style="display:block;">`;

    if (list.length === 0) colHtml += `<div style="padding:10px; font-size:0.8em; color:#666;">None</div>`;
    else {
        list.forEach(d => {
            const { badgeColor, typeLabel } = getDungeonStyles(d.type);
            const isIntersected = intersections.has(d.name) ? 'is-intersected' : '';
            
            // Get Location
            const location = (typeof DUNGEON_LOCATIONS !== 'undefined' && DUNGEON_LOCATIONS[d.name]) 
                             ? DUNGEON_LOCATIONS[d.name] : "Location Unknown";

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

function renderTabView(container, classicList, modularList, intersections) {
    // 1. Render Tabs
    let html = `
    <div class="forecast-tabs">
        <div class="fc-tab ${activeDungeonTab === 'classic' ? 'active' : ''}" onclick="setDungeonTab('classic')">
            🎯 Guild Hunters
        </div>
        <div class="fc-tab ${activeDungeonTab === 'modular' ? 'active' : ''}" onclick="setDungeonTab('modular')">
            ⚔️ Modulux
        </div>
    </div>
    <div class="forecast-list-container">`;

    // 2. Determine which list to show
    const targetList = activeDungeonTab === 'classic' ? classicList : modularList;
    const typeClass = activeDungeonTab === 'classic' ? 'type-classic' : 'type-modular';

    if (targetList.length === 0) {
        html += `<div style="padding:20px; text-align:center; color:#666;">No dungeons found.</div>`;
    } else {
        targetList.forEach(d => {
            const { badgeColor, typeLabel } = getDungeonStyles(d.type);
            const isIntersected = intersections.has(d.name) ? 'is-intersected' : '';
            
            // Get Location
            const location = (typeof DUNGEON_LOCATIONS !== 'undefined' && DUNGEON_LOCATIONS[d.name]) 
                             ? DUNGEON_LOCATIONS[d.name] : "Location Unknown";

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
    let badgeColor = '#27ae60'; // Default Green
    
    if (rawType.includes('231')) badgeColor = '#e67e22';      // Orange
    else if (rawType.includes('216')) badgeColor = '#9b59b6'; // Purple
    else if (rawType.includes('201') || rawType.includes('186')) badgeColor = '#3498db'; // Blue
    
    let rawRange = rawType.replace(/^(DJ|Modulox)\s*/i, '').trim();
    
    return {
        badgeColor: badgeColor,
        typeLabel: `Lvl. ${rawRange}`
    };
}

// INITIALIZATION
// Update timer every minute
setInterval(updateDailyTimer, 60000); 
updateDailyTimer();