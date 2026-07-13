import type { LevelConfig } from "./types";

// Generate levels procedurally: every 5th level is a boss
export function getLevelConfig(index: number): LevelConfig {
  const isBoss = index > 0 && index % 5 === 4; // levels 5, 10, 15... (0-indexed 4,9,14)
  const tier = Math.floor(index / 5);

  const themes: Array<{
    target: [string, string];
    ring: string;
    bg: [string, string];
    name: string;
  }> = [
    {
      target: ["#8b3a2b", "#5a2418"],
      ring: "#f4c96b",
      bg: ["#1a1030", "#0b0820"],
      name: "Woodpile",
    },
    {
      target: ["#2b4a8b", "#182a5a"],
      ring: "#7ac3ff",
      bg: ["#0a1830", "#040820"],
      name: "Frostworks",
    },
    {
      target: ["#3a8b4a", "#1a4a2a"],
      ring: "#a8ff7a",
      bg: ["#08221a", "#040f10"],
      name: "Verdant",
    },
    {
      target: ["#8b3a7a", "#4a1a4a"],
      ring: "#ff7ad4",
      bg: ["#22082a", "#0f0420"],
      name: "Neon Bazaar",
    },
    {
      target: ["#8b7a2b", "#4a3a10"],
      ring: "#ffe27a",
      bg: ["#2a1a08", "#100804"],
      name: "Desert Ember",
    },
  ];
  const theme = themes[tier % themes.length];

  if (isBoss) {
    return {
      index,
      name: `Boss ${tier + 1}: ${theme.name} Colossus`,
      knivesRequired: 8 + tier * 2,
      preAttached: 3 + tier,
      baseSpeed: 2.0 + tier * 0.3,
      speedVariance: 1.5 + tier * 0.3,
      direction: 0,
      hasApples: 2,
      isBoss: true,
      bossHits: 8 + tier * 2,
      targetColor: ["#1a1a2a", "#0a0a15"],
      ringColor: "#ff4466",
      bg: theme.bg,
    };
  }

  const stepInTier = index % 5;
  return {
    index,
    name: `Level ${index + 1} — ${theme.name}`,
    knivesRequired: 5 + stepInTier + Math.min(tier, 4),
    preAttached: Math.min(1 + Math.floor(stepInTier / 2) + tier, 6),
    baseSpeed: 1.4 + stepInTier * 0.25 + tier * 0.35,
    speedVariance: stepInTier >= 2 ? 0.8 + tier * 0.2 : 0,
    direction: stepInTier >= 3 ? 0 : tier % 2 === 0 ? 1 : -1,
    hasApples: stepInTier >= 1 ? Math.min(1 + Math.floor(stepInTier / 2), 3) : 0,
    isBoss: false,
    targetColor: theme.target,
    ringColor: theme.ring,
    bg: theme.bg,
  };
}
