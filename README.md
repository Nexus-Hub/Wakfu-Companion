# Nexus Wakfu Companion
Live Tool: [https://wakfu-companion-production.up.railway.app/](https://wakfu-companion-production.up.railway.app/)

**Nexus Wakfu Companion** is a lightweight, browser-based tool for *Wakfu* with PiP available to act as a Overlay. It parses the game's `wakfu-chat.log` file in real-time to provide combat statistics, item tracking, chat translation, and utility information without requiring external software installation.

## Key Features

### ⚔️ Combat Meter
A fully responsive damage, healing, and armor meter that updates instantly.
*   **Multi-Language Support:** Automatically parses logs in English, French, Spanish, and Portuguese.
*   **Three Modes:** Toggle between **Damage**, **Healing**, and **Armor** statistics.
*   **Detailed Breakdown:** Click on any entity to view specific spell usage and elemental contributions.
*   **Accurate Attribution:** Correctly handles indirect damage sources like Rogue Bombs.
*   **Class Detection:** Automatically identifies player classes based on the spells they cast.
*   **Auto-Reset:** Configurable "Watchdog" timer to automatically reset data after a combat encounter ends.

### ⛏️ Item Tracker
Keep track of resource gathering goals overlaid directly on your screen.
*   **Profession Database:** Includes a built-in database for Miner, Lumberjack, Herbalist, Farmer, Fisherman, and Trapper items.
*   **Goal Setting:** Set target quantities for specific items. The tool tracks your progress via "You have picked up..." log entries.
*   **Visual Notifications:** Pop-up toasts appear when tracked items are looted.
*   **Persistence:** Tracked items are saved to your browser's local storage.
*   **Drag & Drop:** Reorder your tracking list easily.

### 💬 Chat & Translator
An enhanced chat interface designed for international servers.
*   **Channel Filtering:** Filter chat by Vicinity, Group, Guild, Recruitment, Trade, and Community.
*   **Auto-Translation:** Integrated Google Translate support to automatically translate incoming messages from specific languages (PT, FR, ES) to English.
*   **Manual Translation:** One-click button to translate specific messages.
*   **Language Toggles:** Quickly enable or disable translation for specific languages.

### 📜 Utilities & Info Sidebar
Quick access to daily routines and game data.
*   **Daily Timer:** A countdown timer synced to the Europe/Paris timezone (Server time) for daily resets.
*   **Mission Routes:** Optimized travel routes for Daily Missions (Full and Short variations).
*   **Relic Database:** A reference table for Relic fragment locations and token costs.
*   **Daily Dungeon:** Daily dungeons from the Guild Hunters and the Mod'Ule NPC, using data from Vicky Ƶweistein!

## How to Use

1.  **Launch:** Open `index.html` in a modern web browser (Chrome, Edge, or Opera recommended for File System API support).
2.  **Locate Log:** Find your Wakfu log folder (usually `%AppData%/Local/Ankama/Wakfu/game/logs`).
3.  **Connect the file one time only:** Drag and drop the `wakfu-chat.log` file into the "Setup Panel" on the screen for the first run. Next time you open the website, click on Reconnect.
4.  **Overlay:** The tool will now read the file in real-time. You can keep this window open on a second monitor or overlay it on your game.

## Privacy & Security

*   **Local Processing:** This tool runs entirely in your browser using client-side JavaScript.
*   **No Data Uploads:** Your log files are processed locally on your machine. No game data is ever sent to an external server.
*   **Translation:** Chat messages selected for translation are sent to the Google Translate API.

## Browser Compatibility

This tool utilizes the **File System Access API** to read the log file in real-time without needing to re-upload it.
*   **Supported:** Google Chrome, Microsoft Edge, Opera.
*   **Limited/Not Supported:** Firefox (may require manual file re-selection or configuration).

## Tech Stack

*   **HTML5 / CSS3:** Custom dark-mode UI with "Wakfu-like" styling.
*   **JavaScript (Vanilla):** No frameworks or heavy libraries used.
*   **Local Storage:** Used for saving preferences and item tracker data.