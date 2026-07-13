export type Vec2 = { x: number; y: number };

export type Knife = {
  angle: number; // angle relative to target center when stuck
  skin: KnifeSkin;
};

export type FlyingKnife = {
  x: number;
  y: number;
  vy: number;
  rotation: number;
  skin: KnifeSkin;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity?: number;
  shape?: "circle" | "square" | "spark";
};

export type Coin = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  collected: boolean;
  life: number;
};

export type KnifeSkin = {
  id: string;
  name: string;
  cost: number;
  bladeGrad: [string, string];
  handle: string;
  guard: string;
  glow?: string;
};

export type LevelConfig = {
  index: number;
  name: string;
  knivesRequired: number;
  preAttached: number; // knives already on target
  baseSpeed: number; // radians per second
  speedVariance: number; // for phased speed changes
  direction: 1 | -1 | 0; // 0 = alternating
  hasApples: number; // count of apples on target
  isBoss: boolean;
  bossHits?: number;
  targetColor: [string, string];
  ringColor: string;
  bg: [string, string];
};

export type Rotator = {
  angle: number;
  speed: number; // current radians/sec
  targetSpeed: number;
  phaseTimer: number;
  radius: number;
  knives: Knife[];
  apples: number[]; // angles
  hp: number;
  maxHp: number;
  shakeUntil: number;
  hitFlash: number;
};

export type GameState =
  | "menu"
  | "playing"
  | "paused"
  | "gameover"
  | "levelclear"
  | "shop";
