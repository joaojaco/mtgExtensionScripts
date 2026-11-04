# 🃏 MTG Deck Utilities - Chrome Extension

A Google Chrome extension designed to optimize the deck-building and analysis workflow for **Magic: The Gathering (Commander)**, integrated with platforms like **EDHREC** and featuring full support for card lists exported from **Archidekt**.

---

## 🚀 Key Features

### 1. 🔍 Alt-Hover & Token Viewer (`alt-HoverImage.js`)
* **Quick Zoom on EDHREC**: Press and hold **`Alt`** over any card to display a high-resolution floating preview.
* **Token Viewer (`Alt + Q`)**: While holding **`Alt`** to view a card, hold down the **`Q`** key to instantly inspect all tokens created by that card (fetched asynchronously in real time via Scryfall).
* **Scroll Resizing**: Use the mouse scroll wheel while the zoom is active to dynamically resize the images on screen (with preferences saved to `localStorage`).
* **Anti-Freeze Protection**: Includes automatic safeguards (continuous keyboard state checking via `e.altKey`, safety click-to-close, and loss-of-focus detection via `blur`) to ensure the preview never gets stuck on screen.

### 2. 🔗 Direct Opening Shortcuts (`alt-HoverImage.js`)
* **Direct Open on Scryfall**: Built-in shortcuts to quickly open the official card page directly on Scryfall.
* **Direct Open on Scryfall Tagger**: Shortcut to navigate straight to the **Scryfall Tagger** page for the hovered card, making it easy to check community tags, artists, mechanics, and visual classifications.

### 3. 🧮 Smart Mana Calculator (`manaCalculator.js`)
* **Curve & Pip Analysis**: Evaluates mana costs and the mana curve (CMC) of non-land cards to mathematically calculate the ideal land count (suggesting between 30 and 42 cards).
* **Proportional Basic Land Distribution**: Calculates the exact ratio for each basic land (*Plains, Island, Swamp, Mountain, Forest, Wastes*) based on the dominant colored mana pips in your deck.
* **Strict Archidekt Tag Preservation**: Isolates and preserves 100% of your deck's custom tags and categories (e.g., `[Commander{top}]`, `[Ramp]`, `[Removal]`, etc.), allowing you to export the processed list back into Archidekt without losing organization.
* **Complete Audit Report**: Compares original card counts with the generated output, alerting you to freed card slots or total counts while cleanly replacing old basic lands.

### 4. 📦 Set Selector (`setSelector.html`)
* **Edition Management**: A dedicated tool to search, manage, and quickly swap between different card editions and printings for your deck.

### 5. 🎛️ Unified Extension Menu (`popup.html`)
* **Central Hub**: A clean and organized popup accessed from the Chrome extension icon, serving as the main launchpad for navigating the suite's tools in dedicated windows.

---

## 🛠️ Installation & Usage (Developer Mode)

Since this extension runs locally in your browser for development and version control, follow these steps to install it in Chrome:

1. Clone or download this repository to a folder on your computer.
2. Open Google Chrome and go to: `chrome://extensions/`
3. In the top right corner, enable **Developer mode**.
4. In the top left corner, click **Load unpacked**.
5. Select the root folder containing your extension files.

Done! The extension will now be active and ready to use on supported pages.

---

## 📂 Project Structure

```text
├── manifest.json            # Chrome extension configuration & permissions
├── popup.html               # Unified extension menu
├── setSelector.html         # Set selection utility
├── manaCalculator.html      # Mana Calculator user interface
├── manaCalculator.js        # Pip logic, card counting & Archidekt tag parsing
└── alt-HoverImage.js        # Hover script, Alt+Q tokens, Scryfall & Tagger links
