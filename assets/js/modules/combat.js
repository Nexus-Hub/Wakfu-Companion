// HELPER CONSTANTS
const NOISE_WORDS = new Set([
  "Block!",
  "Critical",
  "Critical Hit",
  "Critical Hit Expert",
  "Slow Influence",
  "Backstab",
  "Sidestab",
  "Berserk",
  "Influence",
  "Dodge",
  "Lock",
  "Increased Damage",
]);

function processFightLog(line) {
  const hpUnits = "HP|PdV|PV";
  const armorUnits = "Armor|Armadura|Armure";
  const numPattern = "[\\d,.\\s]+";

  const parts = line.split(/\] /);
  if (parts.length < 2) return;
  const content = parts[1].trim();

  // Auto Reset Logic
  if (
    typeof isAutoResetOn !== "undefined" &&
    isAutoResetOn &&
    typeof awaitingNewFight !== "undefined" &&
    awaitingNewFight &&
    !content.toLowerCase().includes("over")
  ) {
    performReset(true);
    awaitingNewFight = false;
  }

  // 1. Turn/Time Carryover - RESET CASTER
  if (content.includes("carried over") || content.includes("tour suivant")) {
    currentCaster = null;
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

    // Extract suffixes
    const details = (suffix.match(/\(([^)]+)\)/g) || []).map((p) =>
      p.slice(1, -1)
    );

    let detectedElement = null;
    let spellOverride = null;

    for (const d of details) {
      const norm = normalizeElement(d);
      if (norm) {
        detectedElement = norm;
      } else if (!NOISE_WORDS.has(d)) {
        // IMPROVED LOGIC: Spell Override & Item Detection

        // 1. Is the text inside brackets a KNOWN spell in our DB?
        const knownMatch = Array.from(allKnownSpells).find(
          (s) => d === s || d.includes(s)
        );

        if (knownMatch) {
          spellOverride = knownMatch;
        } else {
          // 2. UNKNOWN text processing
          // Detect if this is likely an Item/Consumable which should ALWAYS take precedence
          const isPrioritySource =
            d.includes("Potion") ||
            d.includes("Flask") ||
            d.includes("Flasque") ||
            d.includes("Consumable");

          const isCurrentSpellValid =
            currentSpell && spellToClassMap[currentSpell];

          // If it's a priority item (Potion) OR if we don't have a valid active spell, use the text.
          if (isPrioritySource || !isCurrentSpellValid) {
            if (!d.toLowerCase().includes("lost")) {
              spellOverride = d;
            }
          }
        }
      }
    }

    // ATTRIBUTION LOGIC
    let finalCaster = currentCaster;

    // No active caster? Attribute to Target (Self-proc)
    if (!currentCaster || currentCaster === "Unknown") {
      finalCaster = target;
    }

    // Mechanics that reflect/self-harm
    if (
      ["Burning Armor", "Armadura Ardiente", "Reflect", "Thorns"].some(
        (s) => spellOverride && spellOverride.includes(s)
      )
    ) {
      finalCaster = target;
    }

    // HEAL SAFEGUARD: Ally healing Enemy? -> Probably Boss Mechanic (Self Heal)
    if (sign === "+") {
      const casterIsAlly = finalCaster && isPlayerAlly({ name: finalCaster });
      const targetIsAlly = isPlayerAlly({ name: target });

      if (casterIsAlly && !targetIsAlly) {
        finalCaster = target;
        if (!spellOverride) spellOverride = "Mechanic / Passive";
      }
    }

    let finalSpell = spellOverride || currentSpell;

    // --- CUSTOM OVERRIDES ---

    // 1. Everlasting Myotoxin (Sandyoptera Dungeon) - Force to Enemy
    if (finalSpell && finalSpell.includes("Everlasting Myotoxin")) {
      finalCaster = "Dungeon Mechanic";
      finalSpell = "Everlasting Myotoxin";
    }

    // ------------------------

    // SIGNATURE REROUTING
    if (
      finalSpell &&
      finalSpell !== "Unknown Spell" &&
      finalSpell !== "Passive / Indirect" &&
      finalCaster !== "Dungeon Mechanic" // Don't reroute special mechanic
    ) {
      finalCaster = getSignatureCaster(finalSpell, finalCaster);
    }

    // Summon Binding
    if (summonBindings[finalCaster]) {
      const master = summonBindings[finalCaster];
      finalSpell = `${finalSpell} (${finalCaster})`;
      finalCaster = master;
    }

    const isArmor = unit.match(new RegExp(armorUnits, "i"));

    if (isArmor) {
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
    if (typeof updateWatchdogUI === "function") updateWatchdogUI();
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

  // Mark as dirty so we know we have data to save
  hasUnsavedChanges = true;
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

function saveFightToHistory() {
  // 1. Check if there is data
  if (Object.keys(fightData).length === 0 && Object.keys(healData).length === 0)
    return;

  // 2. NEW: Check if we actually have new changes since last save
  if (!hasUnsavedChanges) return;

  // Create a deep copy of the current state
  const snapshot = {
    damage: JSON.parse(JSON.stringify(fightData)),
    healing: JSON.parse(JSON.stringify(healData)),
    armor: JSON.parse(JSON.stringify(armorData)),
    classes: JSON.parse(JSON.stringify(playerClasses)),
    overrides: JSON.parse(JSON.stringify(manualOverrides)),
    timestamp: new Date().toLocaleTimeString(),
  };

  // Add to start of array
  fightHistory.unshift(snapshot);

  // MEMORY OPTIMIZATION: Limit history to MAX_FIGHT_HISTORY (5)
  while (fightHistory.length > MAX_FIGHT_HISTORY) {
    fightHistory.pop();
  }

  try {
    localStorage.setItem("wakfu_fight_history", JSON.stringify(fightHistory));
  } catch (e) {
    console.error("Failed to save history - Storage full?", e);
    // If storage is full, clear history to prevent app crash
    fightHistory = [];
  }

  // Mark as saved
  hasUnsavedChanges = false;

  updateHistoryButtons();
}

function performReset(isAuto = false) {
  // 1. Try to save (Will be skipped if hasUnsavedChanges is false, e.g. fight just ended)
  saveFightToHistory();

  // 2. Clear Live Data
  fightData = {};
  healData = {};
  armorData = {};

  // 3. Reset State
  currentCaster = "Unknown";
  currentSpell = "Unknown Spell";
  awaitingNewFight = false;
  hasUnsavedChanges = false; // Reset the dirty flag

  // 4. Force view back to LIVE on reset
  currentViewIndex = "live";
  updateHistoryButtons();

  renderMeter();
  updateWatchdogUI();
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

function generateSpellMap() {
  if (typeof classSpells === "undefined") return;
  spellToClassMap = {};
  allKnownSpells = new Set(); // Ensure this is initialized

  // Iterate over each class (e.g., "feca", "iop")
  for (const [className, langData] of Object.entries(classSpells)) {
    // Handle the new structure: Object with languages { en: [], fr: [] }
    if (typeof langData === "object" && !Array.isArray(langData)) {
      // Iterate over each language array
      for (const spells of Object.values(langData)) {
        if (Array.isArray(spells)) {
          spells.forEach((spell) => {
            spellToClassMap[spell] = className;
            allKnownSpells.add(spell);
          });
        }
      }
    }
    // Fallback for flat structure if data is mixed (e.g. array of strings)
    else if (Array.isArray(langData)) {
      langData.forEach((spell) => {
        spellToClassMap[spell] = className;
        allKnownSpells.add(spell);
      });
    }
  }

  // --- MANUAL INJECTIONS ---

  // SADIDA TOXINS & DOLL SPELLS
  const sadidaSpells = [
    "Harmless Toxin",
    "Toxine inoffensive",
    "Toxina inofensiva",
    "Tetatoxin",
    "Tétatoxine",
    "Venomous",
    "Venimeux",
    "Liquid Ghoul",
    // Fix for Task 2: Nettled states
    "Sadida Nettled",
    "Nettled",
  ];

  sadidaSpells.forEach((s) => {
    spellToClassMap[s] = "sadida";
    allKnownSpells.add(s);
  });

  // ECAFLIP
  spellToClassMap["Blackjack"] = "ecaflip";
  allKnownSpells.add("Blackjack");
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
    neutral: "Neutral",
    // French
    feu: "Fire",
    eau: "Water",
    terre: "Earth",
    aire: "Air",
    stase: "Stasis",
    lumière: "Light",
    neutre: "Neutral",
    // Spanish
    fuego: "Fire",
    agua: "Water",
    tierra: "Earth",
    aire: "Air",
    estasis: "Stasis",
    luz: "Light",
    neutral: "Neutral",
    // Portuguese
    fogo: "Fire",
    água: "Water",
    terra: "Earth",
    ar: "Air",
    estase: "Stasis",
    luz: "Light",
    neutro: "Neutral",
  };
  return (
    elementMap[low] ||
    (["Fire", "Water", "Earth", "Air", "Stasis", "Light", "Neutral"].includes(
      el
    )
      ? el
      : null)
  );
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

// Helper: Determine if a player object belongs to Allies or Enemies
function isPlayerAlly(p, contextClasses = null, contextOverrides = null) {
  const classesMap = contextClasses || playerClasses;
  const overridesMap = contextOverrides || manualOverrides;
  const name = p.name;
  const lowerName = name.toLowerCase().trim();

  // 1. Manual Overrides (Highest Priority - from Drag & Drop)
  if (overridesMap[name]) return overridesMap[name] === "ally";

  // 2. Known Monsters & Bosses (Strict Enemy)
  if (monsterLookup[lowerName]) return false;

  // 3. Enemy Families (Generic Logic)
  if (typeof wakfuEnemies !== "undefined") {
    const isEnemy = wakfuEnemies.some((fam) =>
      lowerName.includes(fam.toLowerCase())
    );
    if (isEnemy || name.includes("Punchy") || name.includes("Papas"))
      return false;
  }

  // 4. Detected Player Classes (Ally)
  // Only checks this AFTER confirming it's not a known monster
  if (classesMap[name]) return true;

  // 5. Known Summons (Ally)
  if (typeof allySummons !== "undefined" && allySummons.includes(name))
    return true;

  // 6. Default Fallback -> Enemy
  return false;
}

document.getElementById("resetBtn").addEventListener("click", performReset);

let monsterLookup = {};

function initMonsterDatabase() {
  if (typeof wakfuMonsters === "undefined") return;

  monsterLookup = {};
  wakfuMonsters.forEach((m) => {
    // Map every language version of the name to the imgId
    // Optimization: Intern strings by using the same reference where possible
    const img = m.imgId;
    if (m.nameEN) monsterLookup[m.nameEN.toLowerCase()] = img;
    if (m.nameFR) monsterLookup[m.nameFR.toLowerCase()] = img;
    if (m.nameES) monsterLookup[m.nameES.toLowerCase()] = img;
    if (m.namePT) monsterLookup[m.namePT.toLowerCase()] = img;
  });

  // MEMORY OPTIMIZATION:
  // Try to clear the massive source array to free RAM.
  // Note: This only works if 'wakfuMonsters' is declared with 'let' or 'var' in wakfu_monsters.js.
  // If it is 'const', this will fail silently (caught by the block below).
  try {
    wakfuMonsters = null;
  } catch (e) {
    // Silently fail if wakfuMonsters is const
  }
}

function loadFightHistory() {
  const stored = localStorage.getItem("wakfu_fight_history");
  if (stored) {
    try {
      fightHistory = JSON.parse(stored);
      updateHistoryButtons();
    } catch (e) {
      console.error("Error loading fight history:", e);
      fightHistory = []; // Reset on corruption
    }
  }
}

function updateHistoryButtons() {
  // Update numeric buttons availability
  for (let i = 0; i < 5; i++) {
    const btn = document.getElementById(`btn-hist-${i}`);
    if (btn) {
      if (fightHistory[i]) {
        btn.classList.remove("disabled");
        btn.title = `Fight ended at ${fightHistory[i].timestamp}`;
      } else {
        btn.classList.add("disabled");
        btn.title = "Empty";
      }

      // Highlight active view
      if (currentViewIndex === i) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  }

  // Update Live button
  const liveBtn = document.getElementById("btn-live");
  if (liveBtn) {
    if (currentViewIndex === "live") liveBtn.classList.add("active");
    else liveBtn.classList.remove("active");
  }
}

function viewHistory(index) {
  currentViewIndex = index;
  updateHistoryButtons();
  renderMeter();
}

let permissionStrikeCount = 0; // Counter for transient errors

const LOOT_KEYWORDS = [
  "picked up",
  "ramassé",
  "obtenu",
  "recogido",
  "obtenido",
  "apanhou",
  "obteve",
];

async function parseFile() {
  if (isReading || !fileHandle) return;
  isReading = true;

  try {
    const file = await fileHandle.getFile();

    // If we read successfully, reset the error counter immediately
    permissionStrikeCount = 0;

    if (file.size > fileOffset) {
      const blob = file.slice(fileOffset, file.size);
      const text = await blob.text();
      const lines = text.split(/\r?\n/);

      // Process lines
      lines.forEach(processLine);

      fileOffset = file.size;

      // Update UI
      if (typeof renderMeter === "function") renderMeter();

      if (typeof trackerDirty !== "undefined" && trackerDirty) {
        saveTrackerState();
        renderTracker();
        trackerDirty = false;
      }
    }
  } catch (err) {
    // Handle Permission/Read Errors
    if (err.name === "NotReadableError" || err.message.includes("permission")) {
      permissionStrikeCount++;

      // STRIKE SYSTEM: Only stop if we failed 10 times in a row (~10 seconds)
      if (permissionStrikeCount >= 10) {
        console.error(
          "Nexus Wakfu: Persistent permission loss. Stopping reader."
        );

        if (typeof parseIntervalId !== "undefined") {
          clearInterval(parseIntervalId);
          parseIntervalId = null;
        }

        // Show Reconnect UI
        const setupPanel = document.getElementById("setup-panel");
        const dropZone = document.getElementById("drop-zone");
        const reconnectContainer = document.getElementById(
          "reconnect-container"
        );

        if (setupPanel) setupPanel.style.display = "block";
        if (dropZone) dropZone.style.display = "none";
        if (reconnectContainer) reconnectContainer.style.display = "block";
      }
    } else {
      console.error("File Read Error:", err);
    }
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
    saveFightToHistory();
    awaitingNewFight = true;
    updateWatchdogUI();
  }

  // Handle Log deduplication
  if (logLineCache.has(line)) return;
  logLineCache.add(line);
  if (logLineCache.size > MAX_CACHE_SIZE) {
    const firstItem = logLineCache.values().next().value;
    logLineCache.delete(firstItem);
  }

  try {
    // 1. DATA LOGIC (Update Stats/Tracker)
    const isLoot = LOOT_KEYWORDS.some((kw) => lineLower.includes(kw));
    const isCombat =
      lineLower.includes("[fight log]") ||
      lineLower.includes("[information (combat)]") ||
      lineLower.includes("[información (combate)]") ||
      lineLower.includes("[registro de lutas]");

    if (isLoot) {
      processItemLog(line);
    } else if (isCombat) {
      processFightLog(line);
    }

    // 2. UI LOGIC (Update Chat Window)
    if (line.match(/^\d{2}:\d{2}:\d{2}/)) {
      processChatLog(line);
    }
  } catch (err) {
    console.error("Parsing Error:", err);
  }
}

async function startTracking(handle) {
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
