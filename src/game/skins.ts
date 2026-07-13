import type { KnifeSkin } from "./types";

export const SKINS: KnifeSkin[] = [
  {
    id: "classic",
    name: "Classic Steel",
    cost: 0,
    bladeGrad: ["#e8ecf3", "#8a94a6"],
    handle: "#3b2416",
    guard: "#c9a24a",
  },
  {
    id: "gold",
    name: "Golden Fang",
    cost: 150,
    bladeGrad: ["#fff2a8", "#d19a1a"],
    handle: "#4a2a10",
    guard: "#ffd452",
    glow: "#ffcc33",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    cost: 300,
    bladeGrad: ["#4b4a63", "#111018"],
    handle: "#1a1620",
    guard: "#7a5cff",
    glow: "#7a5cff",
  },
  {
    id: "ruby",
    name: "Ruby Edge",
    cost: 500,
    bladeGrad: ["#ffd0d0", "#c11d3a"],
    handle: "#2a0a10",
    guard: "#ff5577",
    glow: "#ff3355",
  },
  {
    id: "emerald",
    name: "Emerald Whisper",
    cost: 750,
    bladeGrad: ["#d6ffe6", "#0f9a5a"],
    handle: "#0a2018",
    guard: "#4dffb0",
    glow: "#33ff99",
  },
  {
    id: "plasma",
    name: "Plasma Core",
    cost: 1200,
    bladeGrad: ["#e0f7ff", "#3aa8ff"],
    handle: "#0a1a30",
    guard: "#66ccff",
    glow: "#33bbff",
  },
];

export const DEFAULT_SKIN = SKINS[0];
