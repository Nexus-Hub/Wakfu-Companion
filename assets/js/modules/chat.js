let currentChatSearchTerm = "";

// LANGUAGE HEURISTICS
const ES_UNIQUE = new Set([
  "y",
  "el",
  "la",
  "los",
  "las",
  "en",
  "un",
  "una",
  "es",
  "del",
  "al",
  "lo",
  "le",
  "su",
  "sus",
  "pero",
  "con",
  "sin",
  "muy",
  "mi",
  "mis",
  "ti",
  "si",
  "bien",
  "bueno",
  "yo",
  "tu",
  "él",
  "ella",
  "nosotros",
  "ellos",
  "ellas",
  "usted",
]);
const PT_UNIQUE = new Set([
  "e",
  "o",
  "os",
  "as",
  "em",
  "um",
  "uma",
  "é",
  "do",
  "ao",
  "da",
  "na",
  "no",
  "dos",
  "das",
  "nas",
  "nos",
  "seu",
  "sua",
  "com",
  "sem",
  "muito",
  "minha",
  "teu",
  "tua",
  "ele",
  "ela",
  "nós",
  "eles",
  "elas",
  "você",
  "bom",
  "boa",
  "não",
  "são",
]);

const CHAT_COLORS = {
  Logs: "#bbbbbb",
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

function getChannelColor(category) {
  const map = {
    logs: CHAT_COLORS.Logs,
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

function processChatLog(line) {
  const parts = line.split(" - ");
  if (parts.length < 2) return;

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

  // --- SMART FILTERING---
  // If the channel explicitly tags the language (e.g. "[Recruitment (ES)]"),
  // and that language is DISABLED in settings, we flag this message to SKIP translation.

  let shouldSkipAutoTrans = false;
  const chanLower = channel.toLowerCase();

  if (transConfig.enabled) {
    if (chanLower.includes("(es)") && !transConfig.es)
      shouldSkipAutoTrans = true;
    else if (chanLower.includes("(fr)") && !transConfig.fr)
      shouldSkipAutoTrans = true;
    else if (chanLower.includes("(pt)") && !transConfig.pt)
      shouldSkipAutoTrans = true;
  }

  addChatMessage(localTime, channel, author, message, shouldSkipAutoTrans);
}

function addChatMessage(time, channel, author, message, skipAuto = false) {
  const emptyState = chatList.querySelector(".empty-state");
  if (emptyState) chatList.innerHTML = "";

  while (chatList.children.length >= MAX_CHAT_HISTORY) {
    chatList.removeChild(chatList.firstChild);
  }

  const div = document.createElement("div");
  div.className = "chat-msg";

  const category = getCategoryFromChannel(channel);
  div.setAttribute("data-category", category);
  const color = getChannelColor(category);

  div._searchText = `[${channel}] ${author} ${message}`.toLowerCase();

  let isVisible = true;
  if (currentChatFilter === "all") {
    if (category === "logs") isVisible = false;
  } else {
    const isExact = category === currentChatFilter;
    const isExc =
      currentChatFilter !== "logs" &&
      (category === "vicinity" || category === "private");
    if (!isExact && !isExc) isVisible = false;
  }

  if (
    typeof currentChatSearchTerm !== "undefined" &&
    currentChatSearchTerm.trim() !== ""
  ) {
    if (!div._searchText.includes(currentChatSearchTerm)) isVisible = false;
  }

  if (!isVisible) div.classList.add("hidden-msg");

  let displayMessage = message;
  const lowerChan = channel.toLowerCase();

  if (lowerChan.includes("game log")) {
    displayMessage = formatGameLog(message);
  } else if (
    lowerChan.includes("fight log") ||
    lowerChan.includes("combat") ||
    lowerChan.includes("lutas") ||
    lowerChan.includes("information")
  ) {
    displayMessage = formatFightLog(message);
  }

  const transId =
    "trans-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  const channelTag = `[${channel}]`;

  div.innerHTML = `
    <div class="chat-meta">
      <span class="chat-time">${time}</span>
      <span class="chat-channel" style="color:${color}">${channelTag}</span>
      <span class="chat-author" style="color:${color}">${author}</span>
      <button class="manual-trans-btn"
        onclick="queueTranslation('${message.replace(
          /'/g,
          "\\'"
        )}', '${transId}', true)">T</button>
    </div>
    <div class="chat-content">${displayMessage}</div>
    <div id="${transId}" class="translated-block" style="display:none;"></div>
  `;

  chatList.appendChild(div);
  chatList.scrollTop = chatList.scrollHeight;

  if (transConfig.enabled && !skipAuto) {
    queueTranslation(message, transId, false);
  }
}

function formatGameLog(message) {
  let formatted = message;
  let isKama = false;

  // Matches: 10 kamas | 10,000 kamas | 10 000 kamas | NBSP safe
  const kamaRegex = /(\d+(?:[.,\s\u00A0]\d+)*)([\s\u00A0]+)(kamas?)/gi;

  if (kamaRegex.test(formatted)) {
    isKama = true;
    formatted = formatted.replace(kamaRegex, (match, num, space, word) => {
      return `<span class="kama-log">${num}</span>${space}<span class="kama-log">${word}</span>`;
    });
  }

  // Apply red numbers ONLY if not kamas
  if (!isKama && typeof LOOT_KEYWORDS !== "undefined") {
    if (LOOT_KEYWORDS.some((kw) => message.toLowerCase().includes(kw))) {
      formatted = formatted.replace(
        /(?<!>)\b(\d+(?:[.,]\d+)*\s*x?)\b(?![^<]*<\/span>)/g,
        '<span class="loot-log">$1</span>'
      );
    }
  }

  formatted = formatted.replace(/"([^"<]+)"(?![^<]*>)/g, '"<b>$1</b>"');

  return formatted;
}

function formatFightLog(message) {
  let formatted = message;
  const lower = message.toLowerCase();

  // Map patterns to CSS Class + Icon Filename
  const elementMap = {
    "Fire|Feu|Fuego|Fogo": { cls: "dmg-fire", icon: "sFIRE.png" },
    "Air|Aire|Ar": { cls: "dmg-air", icon: "sAIR.png" },
    "Earth|Terre|Tierra|Terra": { cls: "dmg-earth", icon: "sEARTH.png" },
    "Water|Eau|Agua|Água": { cls: "dmg-water", icon: "sWATER.png" },
    "Light|Lumière|Luz": { cls: "dmg-light", icon: "sLIGHT.png" },
    "Stasis|Stase|Estasis|Estase": { cls: "dmg-stasis", icon: "sSTASIS.png" },
  };

  // 1. Full Elemental Damage
  // Regex: Number, Unit, (Element)
  // Reconstructs: [Colored Number] [Space] [Hidden Text] [Icon]
  for (const [pattern, data] of Object.entries(elementMap)) {
    const regex = new RegExp(
      `(-\\s?[\\d,.]+)\\s+(HP|PV|PdV)\\s+\\(\\s*((?:${pattern}))\\s*\\)`,
      "gi"
    );

    formatted = formatted.replace(
      regex,
      (match, dmgPart, unitPart, elementWord) => {
        // Added space after </span>
        return (
          `<span class="${data.cls}">${dmgPart} ${unitPart}</span> ` +
          `<span class="copy-only">(${elementWord})</span>` +
          `<img src="./assets/img/elements/${data.icon}" class="element-icon" alt="">`
        );
      }
    );
  }

  // 2. Neutral Damage
  // Reconstructs: [Red Number] [Space] [Neutral Icon]
  formatted = formatted.replace(
    /(?<!>)(-\s?[\d,.]+)\s(HP|PV|PdV)(?!\s*<span)(?!\s*<img)(?![^<]*<\/span>)/g,
    `<span class="game-log-number">$1 $2</span> <img src="./assets/img/elements/sNEUTRAL.png" class="element-icon" alt="">`
  );

  // 3. Standalone Elements
  for (const [pattern, data] of Object.entries(elementMap)) {
    const simpleRegex = new RegExp(
      `(?<!>)\\(\\s*((?:${pattern}))\\s*\\)`,
      "gi"
    );
    formatted = formatted.replace(simpleRegex, (match, elementWord) => {
      return `<span class="copy-only">(${elementWord})</span><img src="./assets/img/elements/${data.icon}" class="element-icon" alt="">`;
    });
  }

  // 4. Level/XP Numbers
  if (
    lower.includes("level") ||
    lower.includes("lvl") ||
    lower.includes("niveau") ||
    lower.includes("nivel")
  ) {
    formatted = formatted.replace(
      /(?<!>)(?:\+|-)?\b\d+(?:[.,]\d+)*\b(?![^<]*>)/g,
      '<span class="game-log-number">$&</span>'
    );
  }

  // 5. Parentheses Bolding
  formatted = formatted.replace(/\(([^<>()]+)\)/g, "(<b>$1</b>)");

  return formatted;
}

function onChatSearchInput(val) {
  currentChatSearchTerm = val.toLowerCase().trim();
  refreshChatVisibility();
}

function clearChatSearch() {
  const input = document.getElementById("chat-text-filter");
  if (input) input.value = "";
  currentChatSearchTerm = "";
  refreshChatVisibility();
}

function setChatFilter(filter) {
  currentChatFilter = filter;

  // Update Buttons UI
  document
    .querySelectorAll(".filter-btn")
    .forEach((btn) => btn.classList.remove("active"));

  let btnId = "filterALL";
  if (filter !== "all") {
    // Map filter to ID (Recruitment/Community have specific IDs vs Values)
    if (filter === "recruitment") btnId = "filterRECRUIT";
    else if (filter === "community") btnId = "filterCOMM";
    else if (filter === "logs") btnId = "filterLOGS";
    else btnId = "filter" + filter.toUpperCase();
  }

  const activeBtn = document.getElementById(btnId);
  if (activeBtn) activeBtn.classList.add("active");

  refreshChatVisibility();
}

function refreshChatVisibility() {
  // Use a loop that minimizes DOM reflows
  const messages = document.querySelectorAll(".chat-msg");
  const isSearchActive = currentChatSearchTerm !== "";

  // Cache filter state to avoid checking globals inside loop
  const filterIsAll = currentChatFilter === "all";
  const filterIsLogs = currentChatFilter === "logs";

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const cat = msg.getAttribute("data-category");

    // 1. Check Channel Filter (Pure Logic, No DOM reads)
    let channelMatch = false;

    if (filterIsAll) {
      // Show everything EXCEPT logs
      if (cat !== "logs") channelMatch = true;
    } else {
      // Exact Match
      if (cat === currentChatFilter) {
        channelMatch = true;
      }
      // Exceptions for Vicinity/Private (Visible everywhere except LOGS)
      else if (!filterIsLogs && (cat === "vicinity" || cat === "private")) {
        channelMatch = true;
      }
    }

    // 2. Check Text Filter (Using CACHED property - Instant access)
    let textMatch = true;
    if (isSearchActive) {
      // Use the cached _searchText property we created in addChatMessage
      // Fallback to textContent if property is missing (legacy messages)
      const textContent = msg._searchText || msg.textContent.toLowerCase();

      if (!textContent.includes(currentChatSearchTerm)) {
        textMatch = false;
      }
    }

    // 3. Apply Visibility via Class (Faster than style.display)
    if (channelMatch && textMatch) {
      msg.classList.remove("hidden-msg");
    } else {
      msg.classList.add("hidden-msg");
    }
  }

  chatList.scrollTop = chatList.scrollHeight;
}

// CHAT CHANNEL CATEGORIES
function getCategoryFromChannel(channelName) {
  const lower = channelName.toLowerCase();

  // 1. LOGS (Game Log, Fight Log, Combat Info, Errors)
  if (
    lower.includes("log") ||
    lower.includes("combat") ||
    lower.includes("fight") ||
    lower.includes("information") ||
    lower.includes("información") ||
    lower.includes("informações") ||
    lower.includes("registro") || // PT: Registro de Lutas
    lower.includes("lutas") || // PT: Lutas
    lower.includes("error") || // EN/ES: Error
    lower.includes("erreur") || // FR: Erreur
    lower.includes("erro") // PT: Erro
  ) {
    return "logs";
  }

  // 2. VICINITY
  if (
    lower.includes("vicinity") ||
    lower.includes("proximit") ||
    lower.includes("local") ||
    lower.includes("vizinhança")
  )
    return "vicinity";

  // 3. PRIVATE
  if (
    lower.includes("private") ||
    lower.includes("whisper") ||
    lower.includes("priv") ||
    lower.includes("sussurro")
  )
    return "private";

  // 4. GROUP
  if (
    lower.includes("group") ||
    lower.includes("groupe") ||
    lower.includes("grupo")
  )
    return "group";

  // 5. GUILD
  if (
    lower.includes("guild") ||
    lower.includes("guilde") ||
    lower.includes("gremio")
  )
    return "guild";

  // 6. TRADE
  if (
    lower.includes("trade") ||
    lower.includes("commerce") ||
    lower.includes("comercio")
  )
    return "trade";

  // 7. COMMUNITY
  if (
    lower.includes("community") ||
    lower.includes("communaut") ||
    lower.includes("comunidad") ||
    lower.includes("comunidade")
  )
    return "community";

  // 8. RECRUITMENT
  if (
    lower.includes("recruitment") ||
    lower.includes("recrutement") ||
    lower.includes("reclutamiento") ||
    lower.includes("recrutamento")
  )
    return "recruitment";

  // 9. POLITICS
  if (lower.includes("politic")) return "politics";

  // 10. PVP
  if (lower.includes("pvp") || lower.includes("jcj") || lower.includes("camp"))
    return "pvp";

  return "other";
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
    // 1. Short Text Filter: Skip ambiguous short words (unless manual)
    if (!item.isManual && item.text.length < 3) {
      throw new Error("Text too short");
    }

    if (item.text.length < 500) {
      const result = await fetchTranslation(item.text);
      if (result) {
        const l = result.lang.toLowerCase();
        let show = false;

        if (item.isManual) {
          show = true;
        } else {
          // --- SMART LANGUAGE FILTERING ---

          // Case 1: Detected PT, but User speaks ES (ES disabled)
          // Problem: "Nunca se sabe" detected as PT, but is also ES.
          if (l === "pt" || l.startsWith("pt-")) {
            if (transConfig.pt) {
              show = true;
              // Heuristic: If ES is disabled (User knows ES),
              // only show if it looks STRICTLY Portuguese.
              if (!transConfig.es) {
                const scores = checkLanguageFeatures(item.text);
                // If it has ES features or NO specific PT features, hide it.
                if (scores.es > scores.pt || scores.pt === 0) show = false;
              }
            }
          }

          // Case 2: Detected ES, but User speaks PT (PT disabled)
          else if (l === "es" || l.startsWith("es-")) {
            if (transConfig.es) {
              show = true;
              if (!transConfig.pt) {
                const scores = checkLanguageFeatures(item.text);
                if (scores.pt > scores.es || scores.es === 0) show = false;
              }
            }
          }

          // Case 3: French
          else if (l === "fr" || l.startsWith("fr-")) {
            if (transConfig.fr) show = true;
          }

          // Case 4: Others (Everything else not English)
          else if (transConfig.others && !l.startsWith("en")) {
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
  } catch (e) {
    // Silent catch
  }

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

// QUICK TRANSLATOR LOGIC
function openQuickTransModal() {
  const modal = document.getElementById("quick-trans-modal");
  const input = document.getElementById("qt-input");
  const counter = document.getElementById("qt-char-count");

  // Reset state
  input.value = "";
  counter.textContent = "0";
  document.getElementById("qt-output").textContent = "...";
  document.getElementById("qt-output").style.color = "#666";

  input.oninput = function () {
    counter.textContent = this.value.length;
  };

  modal.style.display = "flex"; // Shows the window
  input.focus();
}

function closeQuickTransModal() {
  document.getElementById("quick-trans-modal").style.display = "none";
}

async function performQuickTrans(targetLang) {
  const text = document.getElementById("qt-input").value.trim();
  const outputEl = document.getElementById("qt-output");

  if (!text) return;

  // UI Feedback
  outputEl.textContent = "Translating...";
  outputEl.style.color = "#888";

  // Call Google API: Source (sl) = en, Target (tl) = selected
  const sourceUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(
    text
  )}`;

  try {
    const response = await fetch(sourceUrl);
    const data = await response.json();

    if (data && data[0]) {
      // Join parts if translation is split
      const translatedText = data[0].map((x) => x[0]).join("");

      outputEl.textContent = translatedText;
      outputEl.style.color = "var(--accent)"; // Neon Blue
    } else {
      outputEl.textContent = "Translation Error.";
      outputEl.style.color = "#e74c3c";
    }
  } catch (e) {
    console.error("Quick Trans Error:", e);
    outputEl.textContent = "Network Error.";
    outputEl.style.color = "#e74c3c";
  }
}

function copyQuickTrans() {
  const outputEl = document.getElementById("qt-output");
  const text = outputEl.textContent;
  const btn = document.querySelector(".qt-copy-btn");

  if (
    text &&
    text !== "..." &&
    text !== "Translating..." &&
    text !== "Network Error."
  ) {
    navigator.clipboard.writeText(text).then(() => {
      // Visual Feedback
      const originalIcon = btn.textContent;
      btn.textContent = "✅";
      btn.style.color = "#2ecc71";

      setTimeout(() => {
        btn.textContent = "📋"; // Restore icon (assuming clipboard emoji was used)
        btn.style.color = "";
      }, 1500);
    });
  }
}

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

function checkLanguageFeatures(text) {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u00FF]/g, "")
    .split(/\s+/);
  let esScore = 0;
  let ptScore = 0;

  words.forEach((w) => {
    if (ES_UNIQUE.has(w)) esScore++;
    if (PT_UNIQUE.has(w)) ptScore++;

    // Character checks
    if (w.includes("ñ") || w.includes("¿") || w.includes("¡")) esScore += 5;
    if (w.includes("ç") || w.includes("ã") || w.includes("õ")) ptScore += 5;
  });

  return { es: esScore, pt: ptScore };
}
