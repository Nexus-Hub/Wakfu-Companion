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
