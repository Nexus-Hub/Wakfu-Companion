# Nexus Wakfu Companion

**Live Tool:** [https://wakfu-companion-production.up.railway.app/](https://wakfu-companion-production.up.railway.app/)

**Nexus Wakfu Companion** is a lightweight, browser-based utility for _Wakfu_ players. It parses the game's `wakfu-chat.log` file in real-time using the **File System Access API**, providing an interactive overlay for combat statistics, farming progress, and multilingual chat translation without requiring any local installation or game client modification.

## ⚔️ Key Features

### Advanced Combat Meter

- **Real-Time Stats:** Track Damage, Healing, and Armor across all entities in the fight.
- **Automatic Team Detection:** Intelligently splits "Allies" and "Enemies" using a massive multi-language monster database.
- **Class & Boss Detection:** Automatically identifies player classes and monster types to assign correct high-quality icons.
- **Signature Rerouting:** Correctly attributes indirect damage procs (like Iop's _Lost_ state or Sadida's _Tetatoxin_) to the rightful caster even when logs are delayed.
- **Master/Summon Binding:** Supports manual and automatic binding (e.g., Osamodas summons, Rogue bombs) via Drag & Drop.
- **Toggle to enable Auto-Reset:** The meter stays on screen after a fight ends for review and automatically clears itself only when the **next** battle begins.

### Unified Item Tracker

- **Global Search:** A single search interface covering all 6 gathering professions (Miner, Lumberjack, Herbalist, Farmer, Fisherman, Trapper) plus a massive database of monster drops.
- **Visual Tracking:** Set target goals and watch progress update live as you loot items.
- **Toast Notifications:** Real-time UI alerts when items are picked up.
- **10,000+ Local Icons:** Full visual support for almost every item in the game world.

### Chat & Translator

- **Multilingual Support:** Auto-translates messages from Portuguese (PT), French (FR), and Spanish (ES) to English using Google Translate integration.
- **Channel Filtering:** Focus on specific channels like Guild, Group, Trade, or Recruitment.
- **Manual Translation:** One-click "T" button to translate any specific line on demand.

### Quick Info Sidebar

- **Dungeon Forecast:** Real-time calendar for "Guild of Hunters" and "Mod'Ule" daily dungeons, synced to the **Europe/Paris (Server Time)** reset.
- **Daily Reset Timer:** Live countdown to the next server daily reset.
- **Optimized Routes:** Pre-planned travel routes for Full and Short daily quest runs.

## 🚀 How to Use

1.  **Open:** Use a modern browser (Chrome, Edge, or Opera) to access the tool.
2.  **Locate Log:** Find your Wakfu log folder (usually `%AppData%\zaap\gamesLogs\wakfu\logs\`).
3.  **Connect:** Drag and drop `wakfu-chat.log` onto the setup panel.
4.  **Overlay:** Use the **Picture-in-Picture (PiP)** buttons on each panel to pop them out as "Always on Top" windows over your game.

## 🛠️ Tech Stack & Privacy

- **Privacy First:** All log parsing happens **locally** in your browser. No game data or log contents are ever uploaded to a server.
- **Vanilla JS/HTML/CSS:** No heavy frameworks; designed for maximum performance and low CPU usage while gaming.
- **Persistence:** Your tracked items and preferences are saved to your browser's local storage.

## 🤝 Credits

- **Dungeon Forecast Data:** Sourced from Narakia and Vicky Ƶweistein.
- **Monster & Item Assets:** Compiled from official Wakfu community resources.

---

**Disclaimer:** Nexus Wakfu Companion is a fan-made project and is not affiliated with Ankama Games. It complies with fair-play standards as it only reads local log files and does not inject code into the game client.
