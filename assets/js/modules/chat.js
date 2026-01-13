// CHAT MODULE: Handles Chat, Logs, Formatting, and Translation
const chatListEl = document.getElementById("chat-list");
const scrollBtn = document.getElementById("chat-scroll-btn");
const REGEX_WAIT = /wait (\d+) seconds/i; // Matches: "You must wait 87 seconds..."

if (chatListEl && scrollBtn) {
  chatListEl.addEventListener("scroll", () => {
    // Show button if scrolled up more than 100px
    const distanceToBottom = chatListEl.scrollHeight - chatListEl.scrollTop - chatListEl.clientHeight;
    if (distanceToBottom > 150) {
      scrollBtn.classList.add("visible");
    } else {
      scrollBtn.classList.remove("visible");
    }
  });
}

function scrollToChatBottom() {
  const list = document.getElementById("chat-list");
  if (list) {
    list.scrollTop = list.scrollHeight;
    if (typeof parseFile === "function") {
      parseFile();
    }
  }
}

// Export
window.scrollToChatBottom = scrollToChatBottom;

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
  Logs: "#bbbbbb",
  Default: "#888888",
};

let currentChatSearchTerm = "";

// --- 1. CORE PROCESSING ---

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

  // Detach string from parent buffer (Memory Fix)
  const cleanMessage = (" " + message).slice(1);
  addChatMessage(localTime, channel, author, cleanMessage);
}

function addChatMessage(time, channel, author, message, skipAuto = false) {
  const list = document.getElementById("chat-list");

  // 1. SMART SCROLL: Check if we are at the bottom BEFORE adding new content
  const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 50;

  const emptyState = list.querySelector(".empty-state");
  if (emptyState) list.innerHTML = "";

  // Check raw message for the specific system warning
  const waitMatch = message.match(REGEX_WAIT);
  if (waitMatch) {
    triggerChatCooldown(parseInt(waitMatch[1], 10));
  }

  // Pruning
  while (list.children.length >= MAX_CHAT_HISTORY) {
    const child = list.firstChild;
    list.removeChild(child);
  }

  const div = document.createElement("div");
  div.className = "chat-msg";

  const category = getCategoryFromChannel(channel);
  div.setAttribute("data-category", category);
  const color = getChannelColor(category);

  // Cache text for search
  div._searchText = `[${channel}] ${author} ${message}`.toLowerCase();
  div._rawMessage = message;

  // Visibility Check
  let isVisible = true;
  if (currentChatFilter === "all") {
    if (category === "logs") isVisible = false;
  } else if (currentChatFilter === "logs") {
    if (category !== "logs") isVisible = false;
  } else {
    if (category === currentChatFilter) {
      isVisible = true;
    } else if ((category === "vicinity" || category === "private") && category !== "logs") {
      isVisible = true;
    } else {
      isVisible = false;
    }
  }

  if (isVisible && typeof currentChatSearchTerm !== "undefined" && currentChatSearchTerm.trim() !== "") {
    if (!div._searchText.includes(currentChatSearchTerm)) isVisible = false;
  }

  if (!isVisible) div.classList.add("hidden-msg");

  // Formatting
  let displayMessage = message;
  const lowerChan = channel.toLowerCase();

  if (lowerChan.includes("game log")) {
    displayMessage = formatGameLog(message);
  } else if (lowerChan.includes("fight log") || lowerChan.includes("combat") || lowerChan.includes("lutas") || lowerChan.includes("information")) {
    displayMessage = formatFightLog(message);
  }

  const transId = "trans-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  const channelTag = `[${channel}]`;

  div.innerHTML = `
    <div class="chat-meta">
      <span class="chat-time">${time}</span>
      <span class="chat-channel" style="color:${color}">${channelTag}</span>
      <span class="chat-author" style="color:${color}">${author}</span>
      <button class="manual-trans-btn" data-tid="${transId}">T</button>
    </div>
    <div class="chat-content">${displayMessage}</div>
    <div id="${transId}" class="translated-block" style="display:none;"></div>
  `;

  list.appendChild(div);

  // 2. APPLY SCROLL: If we were at the bottom, force scroll to the new bottom
  if (isAtBottom) {
    list.scrollTop = list.scrollHeight;
  }

  // API Optimization
  if (transConfig.enabled && !skipAuto) {
    if (category === "logs") return;
    if (channel.includes("(PT)") && !transConfig.pt) return;
    if (channel.includes("(FR)") && !transConfig.fr) return;
    if (channel.includes("(ES)") && !transConfig.es) return;

    queueTranslation(message, transId, false);
  }
}

// --- 2. EVENT DELEGATION (Memory Fix) ---
// Instead of 1000 listeners, we use 1.
document.getElementById("chat-list").addEventListener("click", (e) => {
  if (e.target.classList.contains("manual-trans-btn")) {
    const btn = e.target;
    const msgDiv = btn.closest(".chat-msg");
    const transId = btn.dataset.tid;

    if (msgDiv && msgDiv._rawMessage) {
      queueTranslation(msgDiv._rawMessage, transId, true);
    }
  }
});

// --- 3. FILTERS & UI ---

function setChatFilter(filter) {
  currentChatFilter = filter;
  document.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));

  let btnId = "filterALL";
  if (filter !== "all") {
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
  const list = document.getElementById("chat-list");
  const messages = list.children; // Live collection
  const isSearchActive = typeof currentChatSearchTerm !== "undefined" && currentChatSearchTerm.trim() !== "";

  // Batch class updates
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.classList.contains("empty-state")) continue;

    const category = msg.getAttribute("data-category");
    let isVisible = true;

    if (currentChatFilter === "all") {
      if (category === "logs") isVisible = false;
    } else if (currentChatFilter === "logs") {
      if (category !== "logs") isVisible = false;
    } else {
      const isExact = category === currentChatFilter;
      const isExc = category === "vicinity" || category === "private";
      if (!isExact && (!isExc || currentChatFilter === "logs")) isVisible = false;
    }

    if (isVisible && isSearchActive) {
      if (!msg._searchText.includes(currentChatSearchTerm)) isVisible = false;
    }

    // Toggle class instead of style for performance
    msg.classList.toggle("hidden-msg", !isVisible);
  }

  list.scrollTop = list.scrollHeight;
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

// --- 4. FORMATTING ---

function formatGameLog(message) {
  let formatted = message;
  let isKama = false;
  const kamaRegex = /(\d+(?:[.,\s\u00A0]\d+)*)([\s\u00A0]+)(kamas?)/gi;

  if (kamaRegex.test(formatted)) {
    isKama = true;
    formatted = formatted.replace(kamaRegex, '<span class="kama-log">$1</span>$2<span class="kama-log">$3</span>');
  }

  if (!isKama && typeof LOOT_KEYWORDS !== "undefined") {
    if (LOOT_KEYWORDS.some((kw) => message.toLowerCase().includes(kw))) {
      formatted = formatted.replace(/(?<!>)\b(\d+(?:[.,]\d+)*\s*x?)\b(?![^<]*<\/span>)/g, '<span class="loot-log">$1</span>');
    }
  }

  return formatted.replace(/"([^"<]+)"(?![^<]*>)/g, '"<b>$1</b>"');
}

function formatFightLog(message) {
  let formatted = message;
  const lower = message.toLowerCase();

  const elementMap = {
    "Fire|Feu|Fuego|Fogo": { cls: "dmg-fire", icon: "sFIRE.png" },
    "Air|Aire|Ar": { cls: "dmg-air", icon: "sAIR.png" },
    "Earth|Terre|Tierra|Terra": { cls: "dmg-earth", icon: "sEARTH.png" },
    "Water|Eau|Agua|Água": { cls: "dmg-water", icon: "sWATER.png" },
    "Light|Lumière|Luz": { cls: "dmg-light", icon: "sLIGHT.png" },
    "Stasis|Stase|Estasis|Estase": { cls: "dmg-stasis", icon: "sSTASIS.png" },
  };

  // 1. Elemental Resistance
  formatted = formatted.replace(/(?<!>)([-+]?\s?[\d,.]+)(\s+Elemental Resistance)/gi, (match, numberStr) => {
    let cleanNum = numberStr.trim();
    const val = parseFloat(cleanNum.replace(/[,.\s]/g, ""));
    if (val > 0 && !cleanNum.includes("+") && !cleanNum.includes("-")) {
      cleanNum = "+" + cleanNum;
    }
    return `<span style="font-weight:bold; color:#ccc;">${cleanNum}</span> <img src="./assets/img/elements/Elemental_Resistance.png" class="element-icon" alt="Res" title="Elemental Resistance">`;
  });

  // 2. Full Elemental Damage
  for (const [pattern, data] of Object.entries(elementMap)) {
    const regex = new RegExp(`(-\\s?[\\d,.]+)\\s+(HP|PV|PdV)\\s+\\(\\s*((?:${pattern}))\\s*\\)`, "gi");
    formatted = formatted.replace(regex, `<span class="${data.cls}">$1 $2</span> <span class="copy-only">($3)</span><img src="./assets/img/elements/${data.icon}" class="element-icon" alt="">`);
  }

  // 3. Neutral Damage
  formatted = formatted.replace(
    /(?<!>)(-\s?[\d,.]+)\s(HP|PV|PdV)(?!\s*<span)(?!\s*<img)(?![^<]*<\/span>)/g,
    `<span class="game-log-number">$1 $2</span> <img src="./assets/img/elements/sNEUTRAL.png" class="element-icon" alt="">`
  );

  // 4. Standalone Elements
  for (const [pattern, data] of Object.entries(elementMap)) {
    const regex = new RegExp(`(?<!>)\\(\\s*((?:${pattern}))\\s*\\)`, "gi");
    formatted = formatted.replace(regex, `<span class="copy-only">($1)</span><img src="./assets/img/elements/${data.icon}" class="element-icon" alt="">`);
  }

  // 5. Level/XP Numbers
  if (lower.includes("level") || lower.includes("lvl") || lower.includes("niveau") || lower.includes("nivel")) {
    formatted = formatted.replace(/(?<!>)(?:\+|-)?\b\d+(?:[.,]\d+)*\b(?![^<]*>)/g, '<span class="game-log-number">$&</span>');
  }

  // 6. Parentheses Bolding
  return formatted.replace(/\(([^<>()]+)\)/g, "(<b>$1</b>)");
}

// --- 5. TRANSLATION QUEUE ---

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

  if (!item.isManual) {
    const anyLangSelected = transConfig.pt || transConfig.fr || transConfig.es || transConfig.others;
    if (!anyLangSelected) {
      translationQueue.shift();
      setTimeout(processTranslationQueue, 50);
      return;
    }
  }

  isTranslating = true;
  translationQueue.shift();

  try {
    if (!item.isManual && item.text.length < 3) throw new Error("Short");
    if (item.text.length < 500) {
      const result = await fetchTranslation(item.text);
      if (result) {
        const l = result.lang.toLowerCase();
        let show = false;

        if (item.isManual) {
          show = true;
        } else {
          if (transConfig.pt && (l === "pt" || l.startsWith("pt-"))) show = true;
          else if (transConfig.fr && (l === "fr" || l.startsWith("fr-"))) show = true;
          else if (transConfig.es && (l === "es" || l.startsWith("es-"))) show = true;
          else if (transConfig.others && !l.startsWith("en")) show = true;

          // Cross-check PT/ES similarity
          if (show && ((transConfig.pt && !transConfig.es && l.startsWith("es")) || (transConfig.es && !transConfig.pt && l.startsWith("pt")))) {
            const scores = checkLanguageFeatures(item.text);
            if (transConfig.pt && scores.es > scores.pt) show = false;
            if (transConfig.es && scores.pt > scores.es) show = false;
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
  const sourceUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
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

// --- 6. UTILS ---

function getCategoryFromChannel(channelName) {
  const lower = channelName.toLowerCase();
  if (
    lower.includes("log") ||
    lower.includes("combat") ||
    lower.includes("fight") ||
    lower.includes("information") ||
    lower.includes("información") ||
    lower.includes("registro") ||
    lower.includes("lutas") ||
    lower.includes("error") ||
    lower.includes("erreur") ||
    lower.includes("erro")
  )
    return "logs";
  if (lower.includes("vicinity") || lower.includes("proximit") || lower.includes("local") || lower.includes("vizinhança")) return "vicinity";
  if (lower.includes("private") || lower.includes("whisper") || lower.includes("priv") || lower.includes("sussurro")) return "private";
  if (lower.includes("group") || lower.includes("groupe") || lower.includes("grupo")) return "group";
  if (lower.includes("guild") || lower.includes("guilde") || lower.includes("gremio")) return "guild";
  if (lower.includes("trade") || lower.includes("commerce") || lower.includes("comercio")) return "trade";
  if (lower.includes("community") || lower.includes("communaut") || lower.includes("comunidad") || lower.includes("comunidade")) return "community";
  if (lower.includes("recruitment") || lower.includes("recrutement") || lower.includes("reclutamiento") || lower.includes("recrutamento")) return "recruitment";
  if (lower.includes("politic")) return "politics";
  if (lower.includes("pvp") || lower.includes("jcj") || lower.includes("camp")) return "pvp";
  return "other";
}

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

// QUICK TRANSLATOR LOGIC
function openQuickTransModal() {
  const modal = document.getElementById("quick-trans-modal");
  const input = document.getElementById("qt-input");
  const counter = document.getElementById("qt-char-count");

  input.value = "";
  counter.textContent = "0";
  document.getElementById("qt-output").textContent = "...";
  document.getElementById("qt-output").style.color = "#666";

  input.oninput = function () {
    counter.textContent = this.value.length;
  };

  modal.style.display = "flex";
  input.focus();
}

function closeQuickTransModal() {
  document.getElementById("quick-trans-modal").style.display = "none";
}

async function performQuickTrans(targetLang) {
  const text = document.getElementById("qt-input").value.trim();
  const outputEl = document.getElementById("qt-output");

  if (!text) return;
  outputEl.textContent = "Translating...";
  outputEl.style.color = "#888";

  const sourceUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(sourceUrl);
    const data = await response.json();

    if (data && data[0]) {
      const translatedText = data[0].map((x) => x[0]).join("");
      outputEl.textContent = translatedText;
      outputEl.style.color = "var(--accent)";
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

  if (text && text !== "..." && text !== "Translating..." && text !== "Network Error.") {
    navigator.clipboard.writeText(text).then(() => {
      const originalIcon = btn.textContent;
      btn.textContent = "✅";
      btn.style.color = "#2ecc71";
      setTimeout(() => {
        btn.textContent = "📋";
        btn.style.color = "";
      }, 1500);
    });
  }
}

// CONFIG TOGGLES
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
  document.getElementById("btnPT").classList.toggle("active", transConfig.pt && transConfig.enabled);
  document.getElementById("btnFR").classList.toggle("active", transConfig.fr && transConfig.enabled);
  document.getElementById("btnES").classList.toggle("active", transConfig.es && transConfig.enabled);
  document.getElementById("btnOther").classList.toggle("active", transConfig.others && transConfig.enabled);

  const btnMaster = document.getElementById("btnMaster");
  if (transConfig.enabled) {
    btnMaster.className = "lang-btn master-on";
    btnMaster.textContent = "ENABLED";
  } else {
    btnMaster.className = "lang-btn master-off";
    btnMaster.textContent = "DISABLED";
  }
}

// HEURISTICS
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
    if (w.includes("ñ") || w.includes("¿") || w.includes("¡")) esScore += 5;
    if (w.includes("ç") || w.includes("ã") || w.includes("õ")) ptScore += 5;
  });

  return { es: esScore, pt: ptScore };
}

function triggerChatCooldown(seconds) {
  const container = document.getElementById("chat-cooldown-container");
  if (!container) return;

  // Limit to 2 clocks
  if (container.children.length >= 2) {
    // Remove the one closest to finishing (first one usually) or just the top one
    container.removeChild(container.firstElementChild);
  }

  const pill = document.createElement("div");
  pill.className = "cooldown-pill";

  // Unique ID for this timer
  const timerId = Date.now() + Math.random();

  // Initial HTML
  pill.innerHTML = `<span class="cooldown-icon">⏱</span> <span id="cd-${timerId}">${seconds}s</span>`;
  container.appendChild(pill);

  let remaining = seconds;
  const span = document.getElementById(`cd-${timerId}`);

  const interval = setInterval(() => {
    remaining--;
    if (span) span.textContent = `${remaining}s`;

    if (remaining <= 0) {
      clearInterval(interval);
      // Animate out
      pill.style.animation = "fadeOutRight 0.3s ease forwards";
      setTimeout(() => {
        if (pill.parentNode) pill.parentNode.removeChild(pill);
      }, 300);
    }
  }, 1000);
}
