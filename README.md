# 🔪 Galib's Knife Smash
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CrazyGames Ready](https://img.shields.io/badge/CrazyGames-Ready-blue.svg)](https://crazygames.com)
A polished, fast-paced HTML5 knife-throwing arcade game built with **React**, **Vite**, **Tailwind CSS**, and **HTML5 Canvas**. Throw knives at a spinning target, avoid hitting other blades, slice apples for bonus coins, and take down epic bosses — all at a buttery 60fps on both desktop and mobile.
> 🎮 **Play it now:** [Live Demo](https://your-demo-link-here.com) *(replace with your hosted link)*
---
## ✨ Features
- 🎯 **Tight Core Loop** — tap or press Space to throw; the first 10 seconds are instantly fun
- 📈 **Progressive Levels** — speed, direction changes, and pre-attached knives ramp up every level
- 🐉 **Boss Fights** — every 5th level is a boss with a multi-hit HP bar and dynamic rotation
- 🍎 **Apple Bonuses** — hit apples for extra coins, particles, and slow-motion feedback
- 💰 **Coin Economy** — earn coins to unlock 6 unique knife skins with glowing effects
- 🏆 **High Scores** — local top-10 leaderboard with level tracking
- 🎨 **6 Unlockable Skins** — Classic, Gold, Obsidian, Ruby, Emerald, Plasma
- 📳 **Mobile First** — touch controls, locked viewport, DPR-aware canvas, 60fps on phones
- 🎵 **WebAudio SFX** — satisfying throw, stick, hit, coin, and boss sounds (no external assets)
- 🌐 **CrazyGames SDK v3** — built-in `gameplayStart/Stop`, `happytime`, and ad-break support
- 🖼️ **Custom Start Screen** — background photo support (`public/galib.jpg`)
---
## 🎮 How to Play
| Action | Desktop | Mobile |
|--------|---------|--------|
| Throw Knife | `Space` / `↑` / `W` | Tap anywhere |
| Pause / Resume | `Esc` / `P` | Pause button |
| Retry Level | `R` | Tap Retry |
| Mute / Unmute | `M` | Settings |
**Goal:** Stick all your knives into the rotating target without hitting existing blades. Hit apples for bonus coins. Defeat the boss every 5 levels!
---
## 🛠️ Tech Stack
- **React 19** + **TypeScript**
- **Vite** (with `vite-plugin-singlefile` for single-file builds)
- **Tailwind CSS v4**
- **HTML5 Canvas API** (custom game engine, no external game libraries)
- **WebAudio API** (procedural sound synthesis)
- **CrazyGames SDK v3** (optional, gracefully degrades when unavailable)
---
## 🚀 Getting Started
### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- npm or yarn
### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/galibs-knife-smash.git
cd galibs-knife-smash
# Install dependencies
npm install
# Start the dev server
npm run dev
```
The game will be available at `http://localhost:5173`.
### Build for Production
```bash
npm run build
```
The production build is output to the `dist/` folder. The build is configured with `vite-plugin-singlefile`, producing a single self-contained `index.html` (images in `public/` are copied separately).
---
## 🌐 CrazyGames Integration
This game is **CrazyGames-ready** out of the box:
- SDK script is loaded from CDN in `index.html`
- All SDK calls are wrapped in a **fail-safe module** (`src/game/crazySdk.ts`)
- If the SDK is unavailable (local dev, offline, non-CG domain), the game runs in **no-op mode** without any errors
- Activity events fire automatically:
  - `gameplayStart()` / `gameplayStop()` on play / pause / menu / game over
  - `loadingStart()` / `loadingStop()` around initialization
  - `happytime()` on boss defeat and new high score
No code changes are required to publish on CrazyGames — just upload the `dist/` contents.
---
## 🗂️ Project Structure
```
├── public/
│   └── galib.jpg              # Start screen background (replace with yours)
├── src/
│   ├── App.tsx                # Main React app + UI screens
│   ├── game/
│   │   ├── engine.ts          # Canvas game engine (render + physics)
│   │   ├── types.ts           # Game type definitions
│   │   ├── levels.ts          # Procedural level generator
│   │   ├── skins.ts           # Unlockable knife skins
│   │   ├── audio.ts           # WebAudio sound effects
│   │   ├── storage.ts         # localStorage persistence
│   │   └── crazySdk.ts        # CrazyGames SDK safe wrapper
│   ├── index.css
│   └── main.tsx
├── index.html
├── vite.config.ts
└── README.md
```
---
## 🖼️ Customization
### Replace the Start Screen Background
Drop your own image into:
```
public/galib.jpg
```
The game will automatically display it behind the menu. If the image is missing, a graceful gradient fallback is shown instead.
### Add More Knife Skins
Edit `src/game/skins.ts` and add new skin objects:
```ts
{
  id: "my-skin",
  name: "My Skin",
  cost: 999,
  bladeGrad: ["#color1", "#color2"],
  handle: "#handleColor",
  guard: "#guardColor",
  glow: "#optionalGlowColor"
}
```
---
## 📜 License
This project is open source and available under the [MIT License](LICENSE).
---
## 🙏 Credits
**Designed and developed by [Md. Asadullah Hil Galib](https://github.com/yourusername)**  
**Founder of [SoftCT.com](https://softct.com)**
Built with passion for the web gaming community. If you enjoy the game, a ⭐ on GitHub is appreciated!
---
<p align="center">
  <sub>Made with 🔪 and 💜 by Galib</sub>
</p>
