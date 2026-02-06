let dragSrcIndex = null;
let sortDirection = 1; // 1 = Ascending, -1 = Descending

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
            ? `./assets/img/items/${item.imgId}.png`
            : `./assets/img/resources/${item.name.replace(/\s+/g, "_")}.png`;

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

          const goalSound = new Audio("./assets/sfx/tracking_completed.mp3");
          goalSound.volume = 0.05;
          goalSound.play().catch((e) => {});
        }
      }
    });

    if (updated) {
      trackerDirty = true;
    }
  }
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
  // Force tooltip to hide immediately when deleting
  hideTooltip();

  // Filter the array to exclude the item with the matching ID
  trackedItems = trackedItems.filter((t) => t.id !== id);

  // Save the new state to LocalStorage
  saveTrackerState();

  // Refresh the UI
  renderTracker();
}

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

// Function to Toggle Footer
function toggleTrackerTotals() {
  showTrackerFooter = !showTrackerFooter;
  localStorage.setItem("wakfu_show_totals", showTrackerFooter);
  renderTracker(); // Re-render to apply display state
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

function openTrackerModal(itemId) {
  const item = trackedItems.find((t) => t.id === itemId);
  if (!item) return;

  const modal = document.getElementById("tracker-modal");

  // MAIN ITEM ICON
  const itemIconPath =
    item.profession === "ALL" && item.imgId
      ? `./assets/img/items/${item.imgId}.png`
      : `./assets/img/resources/${item.name.replace(/\s+/g, "_")}.png`;

  document.getElementById("modal-item-name").textContent = item.name;
  const modalIcon = document.getElementById("modal-item-icon");
  modalIcon.src = itemIconPath;

  modalIcon.onerror = function () {
    this.src = "./assets/img/resources/not_found.png";
    this.onerror = null;
  };

  // Get Inputs
  const curInput = document.getElementById("modal-input-current");
  const tarInput = document.getElementById("modal-input-target");
  const priceInput = document.getElementById("modal-input-price");

  // Set Initial Values
  curInput.value = item.current;
  tarInput.value = item.target;
  priceInput.value = item.price || 0;

  // --- CALCULATION LOGIC ---
  const calcCurrentEl = document.getElementById("modal-calc-current");
  const calcTargetEl = document.getElementById("modal-calc-target");

  function updateModalCalc() {
    const c = parseInt(curInput.value) || 0;
    const t = parseInt(tarInput.value) || 0;
    const p = parseInt(priceInput.value) || 0;

    const totalCur = c * p;
    const totalTar = t * p;

    // Append symbol here to ensure single text block alignment
    calcCurrentEl.textContent = totalCur.toLocaleString() + " ₭";
    calcTargetEl.textContent = totalTar.toLocaleString() + " ₭";
  }

  // Real-time listeners
  curInput.oninput = updateModalCalc;
  tarInput.oninput = updateModalCalc;
  priceInput.oninput = updateModalCalc;

  // Run calculation immediately
  updateModalCalc();

  // SAVE BUTTON
  document.getElementById("modal-save-btn").onclick = () => {
    const newCur = parseInt(curInput.value) || 0;
    const newTar = parseInt(tarInput.value) || 0;
    const newPrice = parseInt(priceInput.value) || 0;

    item.current = newCur;
    item.target = newTar;
    item.price = newPrice;

    saveTrackerState();
    renderTracker();
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
