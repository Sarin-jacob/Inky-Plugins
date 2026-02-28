# 🖥️ Inky Hub & Plugins

Welcome to **Inky Plugins** — a massive collection of zero-backend, client-side dashboard plugins, scripts, and resources designed specifically for the [Inky E-Ink Display System](https://github.com/Sarin-jacob/Inky). 

Whether you want to turn your e-ink screen into an AI research dashboard, a hardcore GitHub commit tracker, a daily puzzle board, or a minimalist desk clock, this repository has everything you need.

---

## 🔗 Quick Links
* **Live Web Hub:** [Inky Hub](https://sarin-jacob.github.io/Inky-Plugins)
* **Main Hardware Repo:** [Sarin-jacob/Inky](https://github.com/Sarin-jacob/Inky)

---

## 🗂️ Repository Structure

This repository is divided into three main components:

### 1. The Web Hub (Client-Side Dashboard)
Located in the root directory, this is a fully responsive, Dark Mode-enabled PWA (Progressive Web App). It requires **zero backend server**. It uses pure HTML5 Canvas to render UI elements, stores your API keys securely in your browser's `localStorage`, and pushes the raw pixel data directly to your local Inky display over Wi-Fi.

### 2. `/Scripts` (System Automation)
A collection of standalone system scripts (Python, Bash, etc.) that can be run on your local machine, Raspberry Pi, or home server. These are perfect for setting up cron jobs that ping data or push custom frames to your Inky display entirely in the background.

### 3. `/Quotes` (On-Device Resources)
A curated collection of over **500+ text quotes**, ranging from philosophy and anime (Naruto) to coding humor. These files are formatted perfectly to be uploaded directly into Inky's native control panel for on-device, offline rendering.

---

## 🧩 The Plugin Library

The Web Hub comes pre-loaded with 20+ highly polished plugins tailored for developers, researchers, and productivity enthusiasts. 

**Tech & Dev:**
* **GitHub Hacker Card:** Renders your 52-week contribution "grass" map (supports private repos via PAT).
* **Website Status Monitor:** Pings a list of URLs and displays a live UP/DOWN status board.
* **Server Activity Monitor:** Keep an eye on your recent GitHub commits.

**AI & Research:**
* **ML Equation of the Day:** Dynamically fetches and renders complex LaTeX equations (Transformers, GANs, etc.) at perfectly crisp e-ink resolutions.
* **Hugging Face Trending:** Tracks the top downloaded AI models on the Hugging Face hub.
* **ML Glossary:** Cycles through 100+ essential machine learning terms and definitions.

**Puzzles & Games:**
* **Conway's Game of Life:** A zero-player cellular automaton that evolves on your screen.
* **Daily Chess Puzzle:** Pulls the official daily puzzle from Chess.com and draws the FEN board mathematically.
* **Algorithmic Maze:** Generates a perfect, solvable maze every time using Depth-First Search.
* **Daily Sudoku:** Generates a clean, playable 9x9 grid.

**Productivity & Utility:**
* **Pomodoro Tracker:** A massive visual progress bar for deep work sessions.
* **Todoist Integration:** Pulls your active daily tasks via the Todoist API.
* **Markdown Scratchpad:** A custom text area that natively parses headers and checkboxes into a beautiful e-ink to-do list.

**Aesthetics & Screensavers:**
* **10 PRINT:** Classic 1980s retro generative geometry.
* **Harmonic Lissajous:** Math-art curves that slowly mutate based on the time of day.
* **Procedural Lunar Phase:** Mathematically calculates the moon's age and draws its exact phase with a blueprint cross-hatch background.
* **Hex Data Rain:** A static snapshot of falling hexadecimal code.

---

## 🚀 How to Use the Web Hub

1. Set **Inky** to `API Push Mode`
1. Open the [Inky Hub](https://sarin-jacob.github.io/Inky-Plugins).
2. Click **Settings** (⚙️) to enter your Inky's local IP address (e.g., `http://inky.local`) and your desired refresh interval.
3. Browse the Plugin Library. If a plugin requires an API key (like OpenWeather or GitHub), click **Settings** to securely add it.
4. The canvas will render a live preview. The Hub will automatically start pushing the rendered frame to your display based on your interval!

> **Security Note:** All API keys, settings, and Personal Access Tokens (PATs) are saved locally in your browser's `localStorage`. They are never sent to any external server other than the specific API being requested.

> **Important:** Inky listens on both http and https(with self signed cerificate) so if you are using https for the hub then use https for inky url and visit `https://<inky ip>` and continue to site, else the hub cannot push to inky 

---

## 🛠️ Contributing
Got an idea for a cool e-ink plugin? Contributions are always welcome! 

1. Fork the repo.
2. Add your plugin object to the `Plugins` array in `app.js`. Use the `canvasUtils` for easy text wrapping and scaling.
3. Submit a Pull Request.

---
*Built for the SM Lab.*
