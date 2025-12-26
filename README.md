# Nexus Wakfu Companion

**Live Tool:** [https://wakfu-companion-production.up.railway.app/](https://wakfu-companion-production.up.railway.app/)

**Nexus Wakfu Companion** is a high-performance, browser-based utility for _Wakfu_ players. It parses the game's `wakfu-chat.log` file in real-time using the **File System Access API**, providing an interactive overlay for combat statistics, inventory tracking, and multilingual chat translation without requiring any local installation or game client modification.

## 🚀 New in This Version

- **📉 Memory Optimization:** Implemented batch rendering and DOM limiting to prevent memory leaks during long sessions or massive loot streaks (reduced memory usage from ~1.7GB to <200MB).
- **🔍 Item Tracker Filters:** Filter your tracking list by Gathering Profession (Miner, Farmer, Trapper, etc.) or view All items with a single click.
- **⚡ Smart Sorting:** Tracker sorting now prioritizes Crafting Professions first, then Item Level, then Name. Supports Ascending/Descending toggle.
- **🛠️ Profession XP Calculator:** Renamed and improved. Calculate resources needed for specific level ranges and add them directly to your tracker.

## ⚔️ Key Features

### 📊 Advanced Combat Meter

- **Real-Time Stats:** Track Damage, Healing, and Armor (Shields) across all entities.
- **Split View:** Automatically separates **Allies** and **Enemies** based on a massive internal database of monster families and player classes.
- **Smart Attribution:**
  - **Indirect Damage:** Spells like _Poisons_ or _Traps_ are correctly attributed to the caster, not the trigger.
  - **Summons:** Drag & Drop a summon onto its master to merge their stats.
- **Auto-Reset Watchdog:** The meter holds data after a fight ends for review and automatically resets **only** when the next fight begins.
- **Picture-in-Picture (PiP):** Pop the meter out into a floating "Always on Top" window overlay.

### 🎒 Intelligent Item Tracker

- **Universal Search:** Database includes all Gathering Resources + Monster Drops.
- **Profession Filters:** Quickly toggle visibility between Miner, Lumberjack, Herbalist, Farmer, Fisherman, and Trapper.
- **Smart Tooltips:** Hover over an item to see which crafting professions use it (e.g., _"Used in: Armorer, Jeweler"_).
- **Visual Progress:** Progress bars for farming goals.
- **Toast Notifications:** Non-intrusive popups when items are looted or goals are reached.

### 💬 Chat & Translator

- **Auto-Translator:** Integrates with Google Translate API to convert PT, FR, and ES messages to English in real-time.
- **Channel Filters:** Toggle visibility for Guild, Group, Trade, Recruitment, etc.
- **Memory Efficient:** Automatically prunes old chat messages to keep browser performance high.

### 📅 Utilities Sidebar

- **Professions XP Calculator:** Calculate exactly how many crafts are needed to reach a target level and generate a shopping list.
- **Dungeon Forecast:** View the current and upcoming daily bonuses for "Guild of Hunters" and "Mod'Ule".
- **Daily Timer:** Live countdown to the server reset (Europe/Paris timezone).
- **Travel Routes:** Optimized paths for daily quest runs.

## 🛠️ How to Use

1.  **Open:** Access the tool in a modern browser (Chrome, Edge, or Opera).
2.  **Locate Log:** Navigate to your Wakfu log folder (Default: `%AppData%\zaap\gamesLogs\wakfu\logs\`).
3.  **Connect:** Drag and drop `wakfu_chat.log` onto the setup panel.
4.  **Permissions:** Grant the browser read access when prompted.
5.  **Overlay:** Click the **⧉ (PiP)** button on any panel to float it over your game window.

## ⚙️ Technical Details

- **Privacy First:** All parsing logic runs **locally** in your browser. No game logs or personal data are ever uploaded to a server.
- **Persistence:**
  - **IndexedDB:** Saves the file handle so you can reconnect instantly upon refreshing the page.
  - **LocalStorage:** Saves your tracker list, window preferences, and forecast data.
- **Stack:** Pure Vanilla JavaScript (ES6+), HTML5, CSS3. Zero framework overhead.

## 🤝 Credits & Data

- **Dungeon Forecast Data:** Sourced from Narakia and Vicky Ƶweistein.
- **Assets:** Game icons and data compiled from official Wakfu community resources.

---

_Disclaimer: Nexus Wakfu Companion is a fan-made project and is not affiliated with Ankama Games. It complies with fair-play standards as it only reads local text files and does not interact with the game client memory or network._
