import { getLevelConfig } from "./levels";
import { sfx } from "./audio";
import { SKINS } from "./skins";
import type {
  Coin,
  FlyingKnife,
  Knife,
  KnifeSkin,
  LevelConfig,
  Particle,
  Rotator,
} from "./types";

const TAU = Math.PI * 2;
const KNIFE_ANGULAR_HITBOX = 0.22; // radians — collision arc
const APPLE_ANGULAR_HITBOX = 0.24;

export type EngineEvents = {
  onScore: (score: number, combo: number) => void;
  onCoins: (coins: number, delta: number) => void;
  onLevel: (level: number, cfg: LevelConfig) => void;
  onKnivesLeft: (n: number, total: number) => void;
  onBossHp: (hp: number, max: number) => void;
  onLevelClear: (level: number) => void;
  onGameOver: (score: number, level: number) => void;
};

type EngineOpts = {
  canvas: HTMLCanvasElement;
  events: EngineEvents;
  getEquippedSkin: () => KnifeSkin;
  addCoins: (n: number) => void;
};

export class Engine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  events: EngineEvents;
  getEquippedSkin: () => KnifeSkin;
  addCoins: (n: number) => void;

  W = 0;
  H = 0;
  dpr = 1;

  running = false;
  paused = false;
  levelIndex = 0;
  cfg!: LevelConfig;
  rotator!: Rotator;
  knivesLeft = 0;
  knivesRequired = 0;
  score = 0;
  combo = 0;
  comboTimer = 0;

  flying: FlyingKnife | null = null;
  particles: Particle[] = [];
  coins: Coin[] = [];

  shakeAmt = 0;
  shakeTime = 0;
  flashTime = 0;

  timeScale = 1;
  slowUntil = 0;

  lastTs = 0;
  rafId = 0;

  // Level transition
  transitionTimer = 0;
  transitionType: "none" | "clear" | "start" = "none";

  // Star burst decorations on level clear
  clearBurstTimer = 0;

  constructor(opts: EngineOpts) {
    this.canvas = opts.canvas;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d ctx");
    this.ctx = ctx;
    this.events = opts.events;
    this.getEquippedSkin = opts.getEquippedSkin;
    this.addCoins = opts.addCoins;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const rect = this.canvas.getBoundingClientRect();
    this.W = rect.width;
    this.H = rect.height;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start(fromLevel = 0) {
    this.levelIndex = fromLevel;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.running = true;
    this.paused = false;
    this.particles = [];
    this.coins = [];
    this.flying = null;
    this.setupLevel();
    this.events.onScore(this.score, this.combo);
    if (!this.rafId) {
      this.lastTs = performance.now();
      this.loop(this.lastTs);
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  pause(v: boolean) {
    this.paused = v;
  }

  setupLevel() {
    this.cfg = getLevelConfig(this.levelIndex);
    const r = Math.min(this.W, this.H) * (this.cfg.isBoss ? 0.28 : 0.24);
    const preKnives: Knife[] = [];
    // Distribute pre-attached knives with a minimum spacing to keep it fair
    const minSpacing = 0.55; // radians
    const placed: number[] = [];
    let attempts = 0;
    while (placed.length < this.cfg.preAttached && attempts < 200) {
      const a = Math.random() * TAU;
      if (placed.every((p) => angDiff(p, a) >= minSpacing)) {
        placed.push(a);
      }
      attempts++;
    }
    for (let i = 0; i < placed.length; i++) {
      preKnives.push({
        angle: placed[i],
        skin: SKINS[(this.levelIndex + i) % SKINS.length],
      });
    }
    const apples: number[] = [];
    for (let i = 0; i < this.cfg.hasApples; i++) {
      // place apples at empty spots
      let a = Math.random() * TAU;
      let attempts = 0;
      while (
        attempts < 20 &&
        (preKnives.some((k) => angDiff(k.angle, a) < 0.5) ||
          apples.some((x) => angDiff(x, a) < 0.6))
      ) {
        a = Math.random() * TAU;
        attempts++;
      }
      apples.push(a);
    }
    this.rotator = {
      angle: 0,
      speed: this.cfg.baseSpeed * (this.cfg.direction || 1),
      targetSpeed: this.cfg.baseSpeed * (this.cfg.direction || 1),
      phaseTimer: 1.5,
      radius: r,
      knives: preKnives,
      apples,
      hp: this.cfg.bossHits ?? 0,
      maxHp: this.cfg.bossHits ?? 0,
      shakeUntil: 0,
      hitFlash: 0,
    };
    this.knivesRequired = this.cfg.knivesRequired;
    this.knivesLeft = this.cfg.knivesRequired;
    this.transitionType = "start";
    this.transitionTimer = 0.55;
    this.events.onLevel(this.levelIndex + 1, this.cfg);
    this.events.onKnivesLeft(this.knivesLeft, this.knivesRequired);
    if (this.cfg.isBoss) {
      this.events.onBossHp(this.rotator.hp, this.rotator.maxHp);
      sfx.boss();
    } else {
      this.events.onBossHp(0, 0);
    }
    this.spawnFlyingKnife();
  }

  spawnFlyingKnife() {
    this.flying = {
      x: this.W / 2,
      y: this.H * 0.88,
      vy: 0,
      rotation: 0,
      skin: this.getEquippedSkin(),
    };
  }

  throwKnife() {
    if (
      !this.running ||
      this.paused ||
      !this.flying ||
      this.transitionType !== "none"
    )
      return;
    // Give it velocity
    (this.flying as FlyingKnife & { thrown?: boolean }).thrown = true;
    this.flying.vy = -1600; // px/s upward
    sfx.throw();
  }

  private targetCenter() {
    return { x: this.W / 2, y: this.H * 0.42 };
  }

  loop = (ts: number) => {
    this.rafId = requestAnimationFrame(this.loop);
    const dtRaw = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    const dt = this.paused ? 0 : dtRaw * this.timeScale;
    this.update(dt, dtRaw);
    this.draw();
  };

  update(dt: number, dtRaw: number) {
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dtRaw);
    if (this.flashTime > 0) this.flashTime = Math.max(0, this.flashTime - dtRaw);
    if (this.slowUntil > 0) {
      this.slowUntil -= dtRaw;
      if (this.slowUntil <= 0) this.timeScale = 1;
    }
    if (this.transitionTimer > 0) {
      this.transitionTimer -= dtRaw;
      if (this.transitionTimer <= 0) {
        if (this.transitionType === "clear") {
          this.levelIndex++;
          this.setupLevel();
        } else {
          this.transitionType = "none";
        }
      }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dtRaw;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Rotator
    const r = this.rotator;
    r.phaseTimer -= dt;
    if (r.phaseTimer <= 0 && this.cfg.speedVariance > 0) {
      const dir =
        this.cfg.direction === 0
          ? Math.random() < 0.5
            ? 1
            : -1
          : this.cfg.direction;
      const mag =
        this.cfg.baseSpeed +
        (Math.random() * 2 - 1) * this.cfg.speedVariance;
      r.targetSpeed = mag * dir;
      r.phaseTimer = 0.8 + Math.random() * 1.8;
    }
    r.speed += (r.targetSpeed - r.speed) * Math.min(1, dt * 4);
    r.angle += r.speed * dt;
    if (r.hitFlash > 0) r.hitFlash = Math.max(0, r.hitFlash - dtRaw * 3);

    // Flying knife
    if (this.flying) {
      const fk = this.flying as FlyingKnife & { thrown?: boolean };
      if (fk.thrown) {
        fk.y += fk.vy * dt;
        // Check collision with target
        const tc = this.targetCenter();
        const dist = Math.hypot(fk.x - tc.x, fk.y - tc.y);
        if (dist <= r.radius + 6) {
          this.onKnifeHit(fk);
        } else if (fk.y < -40) {
          this.spawnFlyingKnife();
        }
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtRaw;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dtRaw;
      p.y += p.vy * dtRaw;
      if (p.gravity) p.vy += p.gravity * dtRaw;
      p.vx *= 0.98;
    }

    // Coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.life -= dtRaw;
      c.x += c.vx * dtRaw;
      c.y += c.vy * dtRaw;
      c.vy += 900 * dtRaw;
      c.rotation += c.spin * dtRaw;
      if (c.y > this.H + 60 || c.life <= 0) {
        this.coins.splice(i, 1);
      }
    }

    if (this.clearBurstTimer > 0) this.clearBurstTimer -= dtRaw;
  }

  onKnifeHit(fk: FlyingKnife) {
    const r = this.rotator;
    // Knife tip approaches from below the target, so it sticks at world angle +PI/2
    // (the bottom of the target from the viewer's perspective).
    const worldAngle = Math.PI / 2;
    const stickAngle = worldAngle - r.angle;
    const normStick = normalize(stickAngle);

    // Collision: check other knives
    for (const k of r.knives) {
      if (angDiff(normalize(k.angle), normStick) < KNIFE_ANGULAR_HITBOX) {
        this.onKnifeCollision(fk, k);
        return;
      }
    }
    // Apple hit — bonus, still sticks
    let appleHit = -1;
    for (let i = 0; i < r.apples.length; i++) {
      if (angDiff(normalize(r.apples[i]), normStick) < APPLE_ANGULAR_HITBOX) {
        appleHit = i;
        break;
      }
    }

    // Boss hit reduces HP
    let bossKillingBlow = false;
    if (this.cfg.isBoss) {
      r.hp -= 1;
      r.hitFlash = 1;
      this.events.onBossHp(Math.max(0, r.hp), r.maxHp);
      this.shake(6, 0.18);
      if (r.hp <= 0) bossKillingBlow = true;
    }

    r.knives.push({ angle: normStick, skin: fk.skin });
    this.knivesLeft--;
    this.events.onKnivesLeft(this.knivesLeft, this.knivesRequired);

    this.combo++;
    this.comboTimer = 2.5;
    const comboBonus = Math.floor(this.combo * 2);
    let gained = 10 + comboBonus;
    if (appleHit >= 0) {
      gained += 25;
      this.spawnAppleBurst(r, r.apples[appleHit]);
      r.apples.splice(appleHit, 1);
      sfx.apple();
      // Spawn coin
      this.spawnCoin();
    } else {
      sfx.stick();
    }
    this.score += gained;
    this.events.onScore(this.score, this.combo);
    this.spawnStickParticles(fk, appleHit >= 0);
    this.shake(2.5, 0.08);
    this.flashTime = 0.06;

    // small slow-mo on apple or every 5 combo
    if (appleHit >= 0 || this.combo % 5 === 0) {
      this.timeScale = 0.55;
      this.slowUntil = 0.14;
    }

    if (this.knivesLeft <= 0 || bossKillingBlow) {
      this.levelClear();
      this.flying = null;
      return;
    }
    // Next knife
    this.spawnFlyingKnife();
  }

  onKnifeCollision(fk: FlyingKnife, _k: Knife) {
    sfx.hit();
    this.shake(14, 0.35);
    this.flashTime = 0.15;
    this.spawnExplosion(fk.x, fk.y, "#ff5566", 34);
    this.combo = 0;
    this.comboTimer = 0;
    this.events.onScore(this.score, this.combo);
    this.flying = null;
    setTimeout(() => {
      this.gameOver();
    }, 250);
  }

  spawnStickParticles(fk: FlyingKnife, apple: boolean) {
    const n = apple ? 24 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = 60 + Math.random() * 180;
      this.particles.push({
        x: fk.x,
        y: fk.y - 20,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color: apple ? "#ff5b7a" : "#ffe0a8",
        size: 2 + Math.random() * 2,
        gravity: 800,
        shape: "spark",
      });
    }
  }

  spawnAppleBurst(r: Rotator, angle: number) {
    const tc = this.targetCenter();
    const wa = r.angle + angle;
    const ax = tc.x + Math.cos(wa) * r.radius;
    const ay = tc.y + Math.sin(wa) * r.radius;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * TAU;
      const s = 80 + Math.random() * 260;
      this.particles.push({
        x: ax,
        y: ay,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 100,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        color: Math.random() < 0.5 ? "#ff4466" : "#ff8899",
        size: 3 + Math.random() * 3,
        gravity: 1000,
        shape: "circle",
      });
    }
  }

  spawnExplosion(x: number, y: number, color: string, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = 100 + Math.random() * 420;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.6,
        maxLife: 1.1,
        color,
        size: 2 + Math.random() * 4,
        gravity: 600,
        shape: Math.random() < 0.5 ? "spark" : "square",
      });
    }
  }

  spawnCoin() {
    this.coins.push({
      x: this.W / 2 + (Math.random() - 0.5) * 80,
      y: this.H * 0.42,
      vx: (Math.random() - 0.5) * 240,
      vy: -420 - Math.random() * 160,
      rotation: Math.random() * TAU,
      spin: (Math.random() - 0.5) * 12,
      collected: true,
      life: 1.6,
    });
    this.addCoins(1);
    sfx.coin();
  }

  levelClear() {
    this.transitionType = "clear";
    this.transitionTimer = 1.4;
    this.clearBurstTimer = 1.4;
    // level bonus
    const bonus = 50 + this.levelIndex * 20;
    this.score += bonus;
    this.events.onScore(this.score, this.combo);
    // give coins
    const coinReward = this.cfg.isBoss ? 15 : 3 + Math.floor(this.levelIndex / 2);
    this.addCoins(coinReward);
    this.events.onLevelClear(this.levelIndex + 1);
    sfx.levelClear();
    // burst of visual coins
    for (let i = 0; i < coinReward; i++) {
      this.coins.push({
        x: this.W / 2 + (Math.random() - 0.5) * 200,
        y: this.H * 0.42,
        vx: (Math.random() - 0.5) * 420,
        vy: -500 - Math.random() * 260,
        rotation: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 12,
        collected: true,
        life: 2.4,
      });
    }
    this.spawnExplosion(this.W / 2, this.H * 0.42, "#ffd452", 60);
    this.shake(10, 0.4);
  }

  gameOver() {
    this.running = false;
    sfx.gameOver();
    this.events.onGameOver(this.score, this.levelIndex + 1);
  }

  shake(amt: number, time: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amt);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  // === Rendering ===
  draw() {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    ctx.save();
    // shake
    let sx = 0,
      sy = 0;
    if (this.shakeTime > 0) {
      const t = this.shakeTime;
      sx = (Math.random() - 0.5) * this.shakeAmt * (t * 4);
      sy = (Math.random() - 0.5) * this.shakeAmt * (t * 4);
    }
    ctx.translate(sx, sy);

    // background
    const bg = this.cfg?.bg ?? ["#0f0b25", "#050418"];
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, bg[0]);
    grad.addColorStop(1, bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    // subtle grid dots
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    const step = 40;
    for (let x = 0; x < W; x += step) {
      for (let y = 0; y < H; y += step) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    // spotlight behind target
    const tc = this.targetCenter();
    const spot = ctx.createRadialGradient(
      tc.x,
      tc.y,
      20,
      tc.x,
      tc.y,
      this.rotator.radius * 3.2,
    );
    spot.addColorStop(0, "rgba(255,255,255,0.14)");
    spot.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    // Target rotator
    this.drawRotator();

    // Aim guideline (subtle)
    if (this.flying && !(this.flying as FlyingKnife & { thrown?: boolean }).thrown && this.transitionType === "none") {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.flying.x, this.flying.y - 10);
      ctx.lineTo(this.flying.x, tc.y + this.rotator.radius + 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Flying knife (with slight bob before thrown)
    if (this.flying) {
      const fk = this.flying as FlyingKnife & { thrown?: boolean };
      const bob = fk.thrown ? 0 : Math.sin(performance.now() / 200) * 3;
      if (fk.thrown) {
        // motion trail
        const trailGrad = ctx.createLinearGradient(fk.x, fk.y, fk.x, fk.y + 120);
        trailGrad.addColorStop(0, "rgba(255,255,255,0.5)");
        trailGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = trailGrad;
        ctx.fillRect(fk.x - 2, fk.y, 4, 120);
      }
      this.drawKnifeAt(fk.x, fk.y + bob, 0, fk.skin, 1);
    }

    // Particles
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.shape === "square") {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.shape === "spark") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.015, p.y - p.vy * 0.015);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Coins
    for (const c of this.coins) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      const sc = Math.abs(Math.cos(c.rotation * 2));
      ctx.scale(1, 0.3 + sc * 0.7);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
      g.addColorStop(0, "#fff2a8");
      g.addColorStop(0.6, "#ffd452");
      g.addColorStop(1, "#c98a10");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#7a4a10";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#7a4a10";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 1);
      ctx.restore();
    }

    // Level transition — flash
    if (this.transitionType === "start" && this.transitionTimer > 0) {
      const a = this.transitionTimer / 0.55;
      ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.font = "bold 32px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.cfg.name, W / 2, H * 0.2);
    }
    if (this.transitionType === "clear" && this.transitionTimer > 0) {
      const p = 1 - this.transitionTimer / 1.4;
      ctx.fillStyle = `rgba(255, 210, 100, ${0.15 + p * 0.15})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LEVEL CLEAR!", W / 2, H * 0.42 - 20);
      ctx.font = "bold 20px system-ui, sans-serif";
      ctx.fillStyle = "#ffd452";
      ctx.fillText(`+${50 + this.levelIndex * 20} bonus`, W / 2, H * 0.42 + 14);
    }

    // flash overlay
    if (this.flashTime > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashTime * 2.5})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();

    // Combo text (screen space)
    if (this.combo >= 2) {
      const scale = 1 + Math.min(0.6, this.combo * 0.04);
      ctx.save();
      ctx.translate(W - 24, 90);
      ctx.scale(scale, scale);
      ctx.textAlign = "right";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.fillStyle = "#ffd452";
      ctx.shadowColor = "#ff8833";
      ctx.shadowBlur = 12;
      ctx.fillText(`x${this.combo} COMBO`, 0, 0);
      ctx.restore();
    }
  }

  drawRotator() {
    const ctx = this.ctx;
    const r = this.rotator;
    const tc = this.targetCenter();
    ctx.save();
    ctx.translate(tc.x, tc.y);

    // Outer shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(0, 8, r.radius + 6, 0, TAU);
    ctx.fill();

    ctx.rotate(r.angle);

    // Boss glow
    if (this.cfg.isBoss) {
      const g = ctx.createRadialGradient(0, 0, r.radius * 0.4, 0, 0, r.radius * 1.4);
      g.addColorStop(0, "rgba(255,60,90,0.25)");
      g.addColorStop(1, "rgba(255,60,90,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r.radius * 1.4, 0, TAU);
      ctx.fill();
    }

    // Ring
    ctx.strokeStyle = this.cfg.ringColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r.radius, 0, TAU);
    ctx.stroke();

    // Fill
    const [c1, c2] = this.cfg.targetColor;
    const rg = ctx.createRadialGradient(0, 0, 4, 0, 0, r.radius);
    rg.addColorStop(0, c1);
    rg.addColorStop(1, c2);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, r.radius - 3, 0, TAU);
    ctx.fill();

    // Wood grain lines
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, (r.radius - 3) * ((i + 1) / 9), 0, TAU);
      ctx.stroke();
    }

    // Center bullseye
    ctx.fillStyle = this.cfg.ringColor;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();

    // Hit flash
    if (r.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${r.hitFlash * 0.35})`;
      ctx.beginPath();
      ctx.arc(0, 0, r.radius, 0, TAU);
      ctx.fill();
    }

    // Stuck knives (in target local space)
    // Rotate so sprite's +y (body direction) points radially outward at angle ka
    // The sprite tip is at (0,0), body extends to +y. So place tip inside target edge.
    for (const k of r.knives) {
      const ka = k.angle;
      ctx.save();
      ctx.rotate(ka - Math.PI / 2);
      // tip embedded ~12px into target -> place tip at (0, r-12)
      this.drawKnifeSprite(0, r.radius - 12, k.skin, 1);
      ctx.restore();
    }

    // Apples (sit on the edge of the target, radially outward)
    for (const aa of r.apples) {
      ctx.save();
      ctx.rotate(aa - Math.PI / 2);
      ctx.translate(0, r.radius + 4);
      // apple
      ctx.fillStyle = "#ff3f5c";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ff7a90";
      ctx.beginPath();
      ctx.arc(-4, -4, 4, 0, TAU);
      ctx.fill();
      // stem + leaf
      ctx.strokeStyle = "#3a2010";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(2, -20);
      ctx.stroke();
      ctx.fillStyle = "#2ea24a";
      ctx.beginPath();
      ctx.ellipse(6, -18, 5, 3, -0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Boss HP bar (outside rotation)
    if (this.cfg.isBoss) {
      const w = Math.min(this.W * 0.6, 380);
      const h = 12;
      const x = tc.x - w / 2;
      const y = tc.y - r.radius - 42;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = "#3a1020";
      ctx.fillRect(x, y, w, h);
      const pct = Math.max(0, r.hp / r.maxHp);
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, "#ff5566");
      g.addColorStop(1, "#ffb366");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w * pct, h);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`BOSS  ${r.hp} / ${r.maxHp}`, tc.x, y - 6);
    }
  }

  // Draw knife with tip pointing UP (negative y) at origin
  drawKnifeSprite(x: number, y: number, skin: KnifeSkin, scale = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (skin.glow) {
      ctx.shadowColor = skin.glow;
      ctx.shadowBlur = 10;
    }
    // Blade (pointing up, tip at 0,0)
    const bladeGrad = ctx.createLinearGradient(-4, 0, 4, 0);
    bladeGrad.addColorStop(0, skin.bladeGrad[0]);
    bladeGrad.addColorStop(1, skin.bladeGrad[1]);
    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(5, 10);
    ctx.lineTo(5, 46);
    ctx.lineTo(-5, 46);
    ctx.lineTo(-5, 10);
    ctx.closePath();
    ctx.fill();
    // Blade highlight
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-1, 6, 1.5, 38);

    ctx.shadowBlur = 0;
    // Guard
    ctx.fillStyle = skin.guard;
    ctx.fillRect(-10, 46, 20, 5);
    // Handle
    ctx.fillStyle = skin.handle;
    ctx.fillRect(-4, 51, 8, 28);
    // Handle wrap
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const yy = 54 + i * 5;
      ctx.beginPath();
      ctx.moveTo(-4, yy);
      ctx.lineTo(4, yy + 2);
      ctx.stroke();
    }
    // Pommel
    ctx.fillStyle = skin.guard;
    ctx.beginPath();
    ctx.arc(0, 81, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawKnifeAt(x: number, y: number, rot: number, skin: KnifeSkin, scale = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // Draw with tip up
    this.drawKnifeSprite(0, 0, skin, scale);
    ctx.restore();
  }
}

function normalize(a: number) {
  let x = a % TAU;
  if (x < 0) x += TAU;
  return x;
}

function angDiff(a: number, b: number) {
  const d = Math.abs(normalize(a) - normalize(b));
  return Math.min(d, TAU - d);
}
