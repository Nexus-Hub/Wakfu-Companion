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
    // Save immediately when fight ends
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
