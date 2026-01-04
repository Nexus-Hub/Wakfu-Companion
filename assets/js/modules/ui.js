function renderMeter() {
  // MEMORY OPTIMIZATION: Prune icon cache if it gets too large
  if (Object.keys(playerIconCache).length > 100) {
    playerIconCache = {}; // Flush cache to release string memory
  }

  // DETERMINE DATA SOURCE & CONTEXT
  let sourceFight, sourceHeal, sourceArmor;
  let sourceClasses, sourceOverrides; // Context for Ally Detection

  if (currentViewIndex === "live") {
    sourceFight = fightData;
    sourceHeal = healData;
    sourceArmor = armorData;
    sourceClasses = playerClasses;
    sourceOverrides = manualOverrides;

    const liveIndicator = document.getElementById("live-indicator");
    if (liveIndicator) liveIndicator.style.color = "#0f0";
  } else {
    // History View
    const snapshot = fightHistory[currentViewIndex];
    if (!snapshot) return;

    sourceFight = snapshot.damage;
    sourceHeal = snapshot.healing;
    sourceArmor = snapshot.armor;
    // Load the state as it was during that specific fight
    sourceClasses = snapshot.classes || {};
    sourceOverrides = snapshot.overrides || {};

    const liveIndicator = document.getElementById("live-indicator");
    if (liveIndicator) liveIndicator.style.color = "#e74c3c";
  }

  let dataSet;
  if (activeMeterMode === "damage") dataSet = sourceFight;
  else if (activeMeterMode === "healing") dataSet = sourceHeal;
  else dataSet = sourceArmor;

  const players = Object.values(dataSet);

  const alliesContainer = getUI("list-allies");
  const enemiesContainer = getUI("list-enemies");
  const alliesTotalEl = getUI("allies-total-val");
  const enemiesTotalEl = getUI("enemies-total-val");

  if (!alliesContainer || !enemiesContainer) return;

  if (players.length === 0) {
    alliesContainer.innerHTML = `<div class="empty-state">${
      currentViewIndex === "live" ? "Waiting for combat..." : "No data recorded"
    }</div>`;
    enemiesContainer.innerHTML = "";
    alliesTotalEl.textContent = "0";
    enemiesTotalEl.textContent = "0";
    return;
  }

  const allies = [];
  const enemies = [];

  players.forEach((p) => {
    // PASS CONTEXT to detection logic
    if (isPlayerAlly(p, sourceClasses, sourceOverrides)) {
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

    // MEMORY OPTIMIZATION: Use DocumentFragment for batch DOM insertion
    const fragment = document.createDocumentFragment();

    list.forEach((p) => {
      const barPercent = (p.total / maxVal) * 100;
      const totalPercent =
        categoryTotal > 0
          ? ((p.total / categoryTotal) * 100).toFixed(1) + "%"
          : "0.0%";
      const isExpanded = expandedPlayers.has(p.name);

      // --- ICON LOGIC (UPDATED) ---
      // Note: We bypass the global cache if we are in history mode OR if the cache is missing
      // to ensure we use the correct sourceClasses
      let iconHtml = playerIconCache[p.name];

      // If in history mode, regenerate icon to ensure it matches history context
      // (or if missing in live)
      if (currentViewIndex !== "live" || !iconHtml) {
        const lowerName = p.name.toLowerCase().trim();
        const monsterImgId = monsterLookup[lowerName];

        if (monsterImgId) {
          iconHtml = `<img src="././assets/img/monsters/${monsterImgId}" class="class-icon" onerror="this.src='././assets/img/classes/not_found.png';">`;
        } else {
          // USE CONTEXT CLASSES
          const classIconName = sourceClasses[p.name];
          if (classIconName) {
            // Use global variant state for toggle interaction, but history class source
            const isAlt = playerVariantState[p.name];
            const currentSrc = isAlt
              ? `././assets/img/classes/${classIconName}-f.png`
              : `././assets/img/classes/${classIconName}.png`;

            // Note: toggling variant in history won't persist to the history snapshot object, which is fine
            iconHtml = `<img src="${currentSrc}" class="class-icon" onmouseover="toggleIconVariant('${p.name.replace(
              /'/g,
              "\\'"
            )}', this)" onerror="this.src='././assets/img/classes/not_found.png';">`;
          } else {
            iconHtml = `<img src="././assets/img/classes/not_found.png" class="class-icon">`;
          }
        }

        // Only cache if live, otherwise just use it temporarily
        if (currentViewIndex === "live") playerIconCache[p.name] = iconHtml;
      }

      const rowBlock = document.createElement("div");
      rowBlock.className = `player-block ${isExpanded ? "expanded" : ""}`;
      rowBlock.setAttribute("draggable", "true");

      // Drag Events (Only enabled in Live mode for logic safety, or allow visual only?)
      // Allowing dragging in history won't save to history state easily, so maybe keep it functional visually
      rowBlock.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", p.name);
        rowBlock.style.opacity = "0.5";
      });
      rowBlock.addEventListener("dragend", (e) => {
        rowBlock.style.opacity = "1";
      });
      // ... [Drag Over/Drop handlers remain same] ...
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
        // Only allow modifying bindings in LIVE mode
        if (currentViewIndex === "live") {
          const draggedName = e.dataTransfer.getData("text/plain");
          if (draggedName && draggedName !== p.name) {
            summonBindings[draggedName] = p.name;
            mergeSummonData(draggedName, p.name);
            renderMeter();
          }
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
          const iconHtmlSpell = `<img src="././assets/img/elements/${iconName}.png" class="spell-icon" onerror="this.src='././assets/img/elements/neutral.png'">`;

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
      // APPEND TO FRAGMENT INSTEAD OF CONTAINER DIRECTLY
      fragment.appendChild(rowBlock);
    });

    // SINGLE DOM INSERTION
    container.appendChild(fragment);
  };

  renderList(allies, alliesContainer, totalAllyVal);
  renderList(enemies, enemiesContainer, totalEnemyVal);
}

function renderTracker() {
  const listEl = getUI("tracker-list");
  const footerEl = getUI("tracker-total-footer");
  const toggleBtn = getUI("btn-toggle-totals");

  if (!listEl) return;

  // 1. UPDATE FOOTER VISIBILITY
  if (footerEl) {
    footerEl.style.display = showTrackerFooter ? "flex" : "none";
  }
  if (toggleBtn) {
    toggleBtn.style.background = showTrackerFooter ? "#333" : "transparent";
    toggleBtn.style.borderColor = showTrackerFooter ? "#ffd700" : "#444";
  }

  // Clear current UI
  listEl.innerHTML = "";

  if (trackedItems.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Add items to track...</div>';
    if (footerEl) {
      document.getElementById("tf-val-current").textContent = "0 ₭";
      document.getElementById("tf-val-target").textContent = "0 ₭";
    }
    return;
  }

  // --- FILTERING LOGIC ---
  let displayItems = trackedItems;

  if (currentTrackerFilter !== "SHOW_ALL") {
    displayItems = trackedItems.filter((item) => {
      if (currentTrackerFilter === "Trapper") {
        return item.profession === "Trapper" || item.profession === "ALL";
      }
      return item.profession === currentTrackerFilter;
    });
  }

  // --- CALCULATE TOTALS FOR FILTERED ITEMS ---
  let totalCurVal = 0;
  let totalTarVal = 0;

  displayItems.forEach((item) => {
    const p = item.price || 0;
    totalCurVal += item.current * p;
    totalTarVal += item.target * p;
  });

  // Update Footer Text
  if (footerEl) {
    document.getElementById("tf-val-current").textContent =
      totalCurVal.toLocaleString() + " ₭";
    document.getElementById("tf-val-target").textContent =
      totalTarVal.toLocaleString() + " ₭";
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
    const isComplete = item.current >= item.target && item.target > 0;
    const progress = Math.min((item.current / (item.target || 1)) * 100, 100);

    // 1. TOP-LEFT CORNER ICON (Profession)
    const profNameRaw = item.profession || "z_other";
    const profFilename =
      profNameRaw === "ALL"
        ? "monster_resource"
        : profNameRaw.toLowerCase().replace(/\s+/g, "_");
    const profIconPath = `./assets/img/resources/${profFilename}.png`;

    // 2. MAIN ITEM ICON
    let itemIconPath;
    if (item.profession === "ALL" && item.imgId) {
      itemIconPath = `./assets/img/items/${item.imgId}.png`;
    } else {
      const safeItemName = item.name.replace(/\s+/g, "_");
      itemIconPath = `./assets/img/resources/${safeItemName}.png`;
    }

    const rarityName = (item.rarity || "common").toLowerCase();

    // 3. BUILD TOOLTIP TEXT
    const usageInfo = getItemUsage(item.name);
    // Add Price info to tooltip if set
    const priceInfo = item.price
      ? `\nValue: ${(item.current * item.price).toLocaleString()} ₭`
      : "";

    const tooltipText = `${
      item.name
    }\nProgress: ${item.current.toLocaleString()} / ${item.target.toLocaleString()} (${Math.floor(
      progress
    )}%)${priceInfo}${usageInfo}`;

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
                     onerror="this.onerror=null; this.src='./assets/img/resources/not_found.png';">
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
                         onerror="this.onerror=null; this.src='./assets/img/resources/not_found.png';">
                    <div class="t-info-text">
                        <img src="./assets/img/quality/${rarityName}.png" class="rarity-icon" onerror="this.style.display='none'">
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
  timerEl.textContent = `${hStr}h${mStr}m`;
}

// SIDEBAR TOGGLE
function toggleSidebar() {
  const sidebar = document.getElementById("info-sidebar");
  const dungeonSidebar = document.getElementById("dungeon-sidebar");
  const profSidebar = document.getElementById("professions-sidebar");

  // Close others if open (Optional, for cleaner UI)
  if (dungeonSidebar) dungeonSidebar.classList.remove("open");
  if (profSidebar) profSidebar.classList.remove("open");

  sidebar.classList.toggle("open");
}

function toggleDungeonSidebar() {
  const sidebar = document.getElementById("dungeon-sidebar");
  const infoSidebar = document.getElementById("info-sidebar");
  const profSidebar = document.getElementById("professions-sidebar");

  // Close others if open
  if (infoSidebar) infoSidebar.classList.remove("open");
  if (profSidebar) profSidebar.classList.remove("open");

  if (sidebar) {
    sidebar.classList.toggle("open");
    // Ensure UI is rendered if opening for the first time or data changed
    if (sidebar.classList.contains("open")) renderForecastUI();
  }
}

function toggleProfSidebar() {
  const sidebar = document.getElementById("professions-sidebar");
  const infoSidebar = document.getElementById("info-sidebar");
  const dungeonSidebar = document.getElementById("dungeon-sidebar");

  if (infoSidebar) infoSidebar.classList.remove("open");
  if (dungeonSidebar) dungeonSidebar.classList.remove("open");

  if (sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
  } else {
    sidebar.classList.add("open");
  }
}

function toggleSidebarSection(id) {
  const section = document.getElementById(id);
  if (section) {
    section.classList.toggle("collapsed");
  }
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

      // 1. Set Manual Override
      manualOverrides[playerName] = targetType;

      // 2. PERSIST to LocalStorage
      try {
        localStorage.setItem(
          "wakfu_overrides",
          JSON.stringify(manualOverrides)
        );
      } catch (e) {
        console.warn("Failed to save overrides locally");
      }

      renderMeter();
    });
  });
}

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

const UI_TRANSLATIONS = {
  GUILD_HUNTERS: {
    en: "GUILD HUNTERS",
    es: "GREMIO DE CAZADORES",
    fr: "GUILDE DES CHASSEURS",
    pt: "GUILDA DOS CAÇADORES",
  },
  MODULUX: {
    en: "MODULOX",
    es: "MODULOX",
    fr: "MODULOX",
    pt: "MODULOX",
  },
};

function startWatchdog() {
  if (watchdogIntervalId) clearInterval(watchdogIntervalId);
  watchdogIntervalId = setInterval(updateWatchdogUI, 500);
}
