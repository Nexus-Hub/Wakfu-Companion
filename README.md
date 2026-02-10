# Nexus Wakfu Companion

**Live Tool:** [https://wakfu-companion.nexuswow.workers.dev/](https://wakfu-companion.nexuswow.workers.dev/)

**Nexus Wakfu Companion** is a high-performance, browser-based utility for _Wakfu_ players. It parses the game's `wakfu-chat.log` file in real-time using the **File System Access API**, providing an interactive overlay for combat statistics, inventory tracking, session tracking, and multilingual chat translation without requiring any local installation or game client modification.

---

## 🚀 New in This Version

### ⏱️ Session Recap

A powerful new floating window to track your grinding efficiency in real-time:

- **Kamas Tracker:** Tracks Earned, Spent, and Net Profit during the session.
- **XP Breakdown:** Separates **Combat XP** from **Profession XP** (Farmer, Miner, etc.), displaying specific icons for each source.
- **Activities:** Counts completed **Quests** and **Challenges** automatically.
- **Smart Timer:** Tracks session duration with auto-pause functionality (pauses if the tab is closed for >60 seconds).
- **Persistence:** Session data is saved locally, so you don't lose your stats if you refresh the page.

### ⚡ Performance & Optimizations

- **Ultra-Low Memory Footprint:** Rewritten rendering engine using **Event Delegation** and **Lazy Loading**. The app now runs efficiently even during massive log spam.
- **Smart API Usage:** Chat translation now ignores Combat/Game logs to save API quota and bandwidth.
- **Instant Icon Loading:** Fixed icon caching issues for enemies and player classes upon page reload.

---

## ⚔️ Key Features

### 📊 Advanced Combat Meter

- **Real-Time Stats:** Track Damage, Healing, and Armor (Shields).
- **Split View:** Automatically separates **Allies** and **Enemies**.
- **Smart Attribution:**
  - **Indirect Damage:** Poisons, Traps, and Glyphs are correctly attributed to the caster. (Work In Progress)
  - **Summons:** Drag & Drop a summon onto its master in the list to merge their stats.
- **Heal Safeguard:** Automatically detects if a heal is a player spell or a boss mechanic/self-heal.
- **Persistence:** Live combat data is saved to LocalStorage, preventing data loss on accidental refreshes.
- **Picture-in-Picture (PiP):** Pop the meter out into a floating "Always on Top" window overlay.

### 🎒 Intelligent Item Tracker

- **Universal Search:** Database includes Gathering Resources + Monster Drops.
- **Profession Filters:** Toggle visibility for Miner, Lumberjack, Farmer, etc.
- **Smart Tooltips:** Hover over an item to see its usage in recipes (e.g., _"Used in: Armorer, Jeweler"_).
- **Visual Progress:** Progress bars and "Goal Reached" sound effects.
- **Floating Window Support:** Fully functional Delete/Edit controls inside the PiP window.

### 💬 Chat & Translator

- **Auto-Translator:** Integrates with Google Translate API to convert PT, FR, and ES messages to English.
- **Smart Filters:** Strictly separates Game Logs from Chat Messages.
- **Memory Efficient:** Automatically prunes old messages to maintain performance.

### 📅 Utilities Sidebar

- **Crafting XP Calculator:** Calculate exactly how many crafts are needed to reach a target level and generate a resource list.
- **Dungeon Forecast:** View daily bonuses for "Guild of Hunters" and "Mod'Ule".
- **Daily Timer:** Live countdown to the server reset (Europe/Paris timezone).
- **Travel Routes:** Visual pill-based guides for daily quest runs.

---

## 🛠️ How to Use

1.  **Open:** Access the tool in a modern browser (Chrome, Edge, or Opera).
2.  **Locate Log:** Navigate to your Wakfu log folder (Default: `%AppData%\zaap\gamesLogs\wakfu\logs\`).
3.  **Connect:** Drag and drop `wakfu_chat.log` onto the setup panel.
4.  **Permissions:** Grant the browser read access when prompted.
5.  **Overlay:** Click the **⧉ (PiP)** button on any panel to float it over your game window.

## ⚙️ Technical Details

- **Privacy First:** All parsing logic runs **locally** in your browser. No game logs or personal data are ever uploaded to a server.
- **Persistence:**
  - **IndexedDB:** Saves the file handle for instant reconnection.
  - **LocalStorage:** Saves tracker list, window preferences, session stats, and combat history.
- **Stack:** Pure Vanilla JavaScript (ES6+), HTML5, CSS3. Zero framework overhead.

## 🤝 Credits

- **Dungeon Forecast Data:** Sourced from Narakia and Vicky Ƶweistein.
- **Assets:** Game icons and data compiled from official Wakfu community resources.

---

_Disclaimer: Nexus Wakfu Companion is a fan-made project and is not affiliated with Ankama Games. It complies with fair-play standards as it only reads local text files and does not interact with the game client memory or network._
