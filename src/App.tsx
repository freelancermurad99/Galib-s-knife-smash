import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Engine } from "./game/engine";
import type { LevelConfig } from "./game/types";
import { SKINS } from "./game/skins";
import { addHighScore, load, save, type SaveData } from "./game/storage";
import { setMuted, sfx } from "./game/audio";
import {
  initCrazySdk,
  gameplayStart,
  gameplayStop,
  loadingStart,
  loadingStop,
  happytime,
} from "./game/crazySdk";
import galibImg from "./assets/galib.jpg";

type Screen = "menu" | "playing" | "paused" | "gameover" | "shop" | "scores";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const [screen, setScreen] = useState<Screen>("menu");
  const [data, setData] = useState<SaveData>(() => load());
  const [score, setScore] = useState(0);
  const [, setCombo] = useState(0);
  const [level, setLevel] = useState(1);
  const [levelName, setLevelName] = useState("");
  const [knivesLeft, setKnivesLeft] = useState(0);
  const [knivesTotal, setKnivesTotal] = useState(0);
  const [bossHp, setBossHp] = useState({ hp: 0, max: 0 });
  const [floatingCoin, setFloatingCoin] = useState<{ id: number; amount: number } | null>(null);
  const [flashLevel, setFlashLevel] = useState(0);

  // Sync mute state
  useEffect(() => {
    setMuted(data.muted);
  }, [data.muted]);

  // Initialize CrazyGames SDK (safe: never throws, no-op if unavailable).
  // We mark loading start/stop around init so the CG platform can measure load time.
  const sdkReadyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    loadingStart();
    initCrazySdk()
      .then((ok) => {
        if (cancelled) return;
        sdkReadyRef.current = true;
        loadingStop();
        if (ok) console.info("[CrazySDK] ready");
        else console.info("[CrazySDK] running in no-op mode (SDK unavailable)");
      })
      .catch(() => {
        // initCrazySdk never rejects, but guard anyway.
        loadingStop();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateData = useCallback((patch: Partial<SaveData> | ((d: SaveData) => SaveData)) => {
    setData((prev) => {
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  const equippedSkin = useMemo(
    () => SKINS.find((s) => s.id === data.equipped) ?? SKINS[0],
    [data.equipped],
  );
  // Keep a ref for the engine to always get current skin
  const equippedSkinRef = useRef(equippedSkin);
  useEffect(() => {
    equippedSkinRef.current = equippedSkin;
  }, [equippedSkin]);

  // Track current level for stale-closure-safe retry
  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  // Init engine once
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine({
      canvas: canvasRef.current,
      getEquippedSkin: () => equippedSkinRef.current,
      addCoins: (n: number) => {
        updateData((d) => ({ ...d, coins: d.coins + n }));
      },
      events: {
        onScore: (s, c) => {
          setScore(s);
          setCombo(c);
        },
        onCoins: () => {},
        onLevel: (lv, cfg: LevelConfig) => {
          setLevel(lv);
          setLevelName(cfg.name);
          setFlashLevel(Date.now());
        },
        onKnivesLeft: (n, total) => {
          setKnivesLeft(n);
          setKnivesTotal(total);
        },
        onBossHp: (hp, max) => setBossHp({ hp, max }),
        onLevelClear: (lv) => {
          setFloatingCoin({ id: Date.now(), amount: 3 });
          setTimeout(() => setFloatingCoin(null), 1200);
          // Boss levels are every 5th level — celebrate on the CG site.
          if (lv % 5 === 0) happytime();
        },
        onGameOver: (finalScore, lv) => {
          setScreen("gameover");
          setData((prev) => {
            const prevBest = prev.highScores[0]?.score ?? 0;
            const next = addHighScore(prev, finalScore, lv);
            // Celebrate a new personal best.
            if (finalScore > prevBest && finalScore > 0) happytime();
            return next;
          });
        },
      },
    });
    engineRef.current = engine;

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive CrazyGames activity events from the single source of truth: `screen`.
  // "playing" => active gameplay; anything else (menu/pause/gameover/shop/scores)
  // is a break. This guarantees correctly paired gameplayStart/gameplayStop calls
  // regardless of whether the transition came from a button, keyboard, or the
  // engine's own game-over callback. All calls are internally guarded (no-op safe).
  useEffect(() => {
    if (screen === "playing") {
      gameplayStart();
    } else {
      gameplayStop();
    }
  }, [screen]);

  // Also stop gameplay tracking when the tab is closed / navigated away.
  useEffect(() => {
    const onBeforeUnload = () => gameplayStop();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Input: throw on space/click/touch
  useEffect(() => {
    const throwIt = () => {
      const e = engineRef.current;
      if (!e) return;
      if (screen === "playing") e.throwKnife();
    };
    // Fire on a pointer press anywhere in the play area, unless the press landed
    // on an interactive UI control (button/link/input). Attaching at window level
    // guarantees the throw works even though the HUD overlay sits above the canvas.
    const onPointerDown = (ev: PointerEvent) => {
      if (screen !== "playing") return;
      const target = ev.target as HTMLElement | null;
      if (target && target.closest("button, a, input, [data-ui]")) return;
      throwIt();
    };
    window.addEventListener("pointerdown", onPointerDown);

    const onKey = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (ev.code === "Space" || ev.code === "ArrowUp" || ev.code === "KeyW") {
        ev.preventDefault();
        throwIt();
      } else if (ev.code === "Escape" || ev.code === "KeyP") {
        if (screen === "playing") {
          engineRef.current?.pause(true);
          setScreen("paused");
        } else if (screen === "paused") {
          engineRef.current?.pause(false);
          setScreen("playing");
        }
      } else if (ev.code === "KeyR" && (screen === "gameover" || screen === "paused")) {
        retryLevel(levelRef.current - 1);
      } else if (ev.code === "KeyM") {
        updateData((d) => ({ ...d, muted: !d.muted }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const startGame = useCallback(() => {
    sfx.click();
    setScreen("playing");
    setScore(0);
    setCombo(0);
    engineRef.current?.resize();
    engineRef.current?.start(0);
  }, []);

  // Retry from the level the player died on (keeps coins/skins, resets score)
  const retryLevel = useCallback((levelIndexZeroBased: number) => {
    sfx.click();
    setScreen("playing");
    setScore(0);
    setCombo(0);
    engineRef.current?.resize();
    engineRef.current?.start(Math.max(0, levelIndexZeroBased));
  }, []);

  const resume = () => {
    sfx.click();
    engineRef.current?.pause(false);
    setScreen("playing");
  };
  const quitToMenu = () => {
    sfx.click();
    engineRef.current?.stop();
    setScreen("menu");
  };

  const buySkin = (id: string) => {
    const s = SKINS.find((x) => x.id === id);
    if (!s) return;
    if (data.unlocked.includes(id)) {
      updateData({ equipped: id });
      sfx.click();
      return;
    }
    if (data.coins >= s.cost) {
      updateData((d) => ({
        ...d,
        coins: d.coins - s.cost,
        unlocked: [...d.unlocked, id],
        equipped: id,
      }));
      sfx.coin();
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black text-white select-none">
      <div
        ref={wrapRef}
        className="relative h-full w-full max-w-[520px] overflow-hidden"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full block"
        />

        {/* HUD */}
        {screen === "playing" && (
          <div className="pointer-events-none absolute inset-0">
            {/* Top bar */}
            <div className="pointer-events-none flex items-start justify-between p-4">
              <div className="pointer-events-auto flex flex-col gap-1">
                <div className="text-xs font-bold uppercase tracking-widest text-white/60">Score</div>
                <div className="text-3xl font-black tabular-nums drop-shadow-lg">{score.toLocaleString()}</div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-amber-300">
                  <CoinIcon /> {data.coins}
                </div>
              </div>
              <div className="pointer-events-auto flex flex-col items-end gap-2">
                <button
                  aria-label="Pause"
                  onClick={() => {
                    engineRef.current?.pause(true);
                    setScreen("paused");
                    sfx.click();
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md transition hover:bg-white/20 active:scale-95"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                </button>
                <div className="text-right text-xs font-bold uppercase tracking-widest text-white/60">
                  Level {level}
                </div>
              </div>
            </div>

            {/* Knives left indicator (bottom) */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-2 p-4">
              <div className="flex flex-wrap justify-center gap-1.5">
                {Array.from({ length: knivesTotal }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 w-4 rounded-full transition-all ${
                      i < knivesTotal - knivesLeft
                        ? "bg-white/25"
                        : "bg-gradient-to-r from-amber-300 to-amber-500 shadow-[0_0_8px_rgba(255,200,80,0.6)]"
                    }`}
                  />
                ))}
              </div>
              <div className="text-xs font-bold uppercase tracking-widest text-white/50">
                Tap / Space to throw
              </div>
            </div>

            {/* Level name flash */}
            {flashLevel > 0 && (
              <FloatingLevelName key={flashLevel} name={levelName} />
            )}

            {/* Floating coin reward */}
            {floatingCoin && (
              <div
                key={floatingCoin.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-16 animate-[floatUp_1.2s_ease-out_forwards] text-2xl font-black text-amber-300 drop-shadow-lg"
              >
                +{floatingCoin.amount} <CoinIcon />
              </div>
            )}

            {/* Boss HP already drawn on canvas */}
            {bossHp.max > 0 && (
              <div className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow-lg">
                ⚔ Boss Fight
              </div>
            )}
          </div>
        )}

        {/* MENU */}
        {screen === "menu" && (
          <MenuScreen
            data={data}
            equippedSkinId={data.equipped}
            onPlay={startGame}
            onShop={() => {
              sfx.click();
              setScreen("shop");
            }}
            onScores={() => {
              sfx.click();
              setScreen("scores");
            }}
            onToggleMute={() =>
              updateData((d) => ({ ...d, muted: !d.muted }))
            }
          />
        )}

        {/* PAUSED */}
        {screen === "paused" && (
          <Overlay>
            <PanelTitle>Paused</PanelTitle>
            <div className="mt-2 text-center text-white/70">Score: <b className="text-white">{score.toLocaleString()}</b></div>
            <div className="mt-6 flex flex-col gap-3">
              <PrimaryBtn onClick={resume}>Resume</PrimaryBtn>
              <SecondaryBtn onClick={() => retryLevel(level - 1)}>Retry Level {level}</SecondaryBtn>
              <div className="grid grid-cols-2 gap-3">
                <SecondaryBtn onClick={startGame}>From Lv 1</SecondaryBtn>
                <SecondaryBtn onClick={quitToMenu}>Main Menu</SecondaryBtn>
              </div>
            </div>
          </Overlay>
        )}

        {/* GAME OVER */}
        {screen === "gameover" && (
          <Overlay>
            <div className="text-center">
              <div className="text-sm font-bold uppercase tracking-[0.3em] text-red-400">Game Over</div>
              <PanelTitle>You got smashed!</PanelTitle>
            </div>
            <div className="mt-4 flex items-center justify-around rounded-2xl bg-white/5 p-4 backdrop-blur">
              <StatCell label="Score" value={score.toLocaleString()} />
              <StatCell label="Level" value={String(level)} />
              <StatCell label="Best" value={String(data.highScores[0]?.score ?? 0)} />
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <PrimaryBtn onClick={() => retryLevel(level - 1)}>
                🔄 Retry Level {level}
              </PrimaryBtn>
              <div className="grid grid-cols-2 gap-3">
                <SecondaryBtn onClick={startGame}>From Lv 1</SecondaryBtn>
                <SecondaryBtn onClick={quitToMenu}>Main Menu</SecondaryBtn>
              </div>
            </div>
          </Overlay>
        )}

        {/* SHOP */}
        {screen === "shop" && (
          <Overlay wide>
            <div className="flex items-center justify-between">
              <PanelTitle>Knife Shop</PanelTitle>
              <div className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-black text-amber-300">
                <CoinIcon /> {data.coins}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SKINS.map((s) => {
                const owned = data.unlocked.includes(s.id);
                const equipped = data.equipped === s.id;
                const canAfford = data.coins >= s.cost;
                return (
                  <button
                    key={s.id}
                    onClick={() => buySkin(s.id)}
                    disabled={!owned && !canAfford}
                    className={`group relative flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition ${
                      equipped
                        ? "border-amber-400 bg-amber-400/10"
                        : owned
                          ? "border-white/20 bg-white/5 hover:border-white/40"
                          : canAfford
                            ? "border-white/10 bg-white/5 hover:border-emerald-400/60"
                            : "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-50"
                    }`}
                  >
                    <SkinPreview skinId={s.id} />
                    <div className="text-xs font-bold">{s.name}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest">
                      {equipped ? (
                        <span className="text-amber-300">Equipped</span>
                      ) : owned ? (
                        <span className="text-white/50">Owned · Tap to equip</span>
                      ) : (
                        <span className={canAfford ? "text-emerald-300" : "text-red-300"}>
                          <CoinIcon /> {s.cost}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6">
              <SecondaryBtn onClick={() => { sfx.click(); setScreen("menu"); }}>Back</SecondaryBtn>
            </div>
          </Overlay>
        )}

        {/* SCORES */}
        {screen === "scores" && (
          <Overlay>
            <PanelTitle>High Scores</PanelTitle>
            <div className="mt-4 space-y-1.5">
              {data.highScores.length === 0 && (
                <div className="rounded-xl bg-white/5 py-8 text-center text-white/50">
                  No scores yet. Go smash some!
                </div>
              )}
              {data.highScores.map((h, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                    i === 0 ? "bg-amber-500/20" : i < 3 ? "bg-white/10" : "bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-6 text-center font-black ${i === 0 ? "text-amber-300" : "text-white/60"}`}>#{i + 1}</div>
                    <div className="text-lg font-bold tabular-nums">{h.score.toLocaleString()}</div>
                  </div>
                  <div className="text-xs text-white/50">Lv {h.level}</div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <SecondaryBtn onClick={() => { sfx.click(); setScreen("menu"); }}>Back</SecondaryBtn>
            </div>
          </Overlay>
        )}
      </div>

      <style>{`
        @keyframes floatUp {
          0% { transform: translate(-50%, -4rem) scale(0.6); opacity: 0; }
          20% { transform: translate(-50%, -5rem) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%, -10rem) scale(1); opacity: 0; }
        }
        @keyframes slideFade {
          0% { transform: translate(-50%, 20px); opacity: 0; }
          15% { transform: translate(-50%, 0); opacity: 1; }
          85% { transform: translate(-50%, 0); opacity: 1; }
          100% { transform: translate(-50%, -20px); opacity: 0; }
        }
        @keyframes pop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function FloatingLevelName({ name }: { name: string }) {
  return (
    <div
      className="absolute left-1/2 top-32 -translate-x-1/2 animate-[slideFade_2s_ease-in-out_forwards] rounded-full bg-black/60 px-5 py-2 text-sm font-black uppercase tracking-[0.2em] text-white shadow-2xl backdrop-blur"
    >
      {name}
    </div>
  );
}

function MenuScreen({
  data,
  equippedSkinId,
  onPlay,
  onShop,
  onScores,
  onToggleMute,
}: {
  data: SaveData;
  equippedSkinId: string;
  onPlay: () => void;
  onShop: () => void;
  onScores: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between overflow-hidden p-6">
      {/* Background photo. Imported directly so it bundles into the single file. */}
      <img
        src={galibImg}
        alt=""
        aria-hidden="true"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      {/* Readability overlay + theme tint on top of the photo */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-950/70 via-purple-950/55 to-black/90" />
      <div className="pointer-events-none absolute inset-0 bg-black/25 backdrop-blur-[1px]" />

      <div className="relative z-10 flex w-full items-center justify-between">
        <div className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-black text-amber-300">
          <CoinIcon /> {data.coins}
        </div>
        <button
          onClick={onToggleMute}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur transition hover:bg-white/20"
          aria-label="Toggle sound"
        >
          {data.muted ? "🔇" : "🔊"}
        </button>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 text-center animate-[pop_0.5s_ease-out] drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
        <div className="text-[11px] font-black uppercase tracking-[0.4em] text-amber-300">
          Galib's
        </div>
        <h1 className="text-6xl font-black leading-none tracking-tight drop-shadow-[0_4px_20px_rgba(255,180,80,0.4)]">
          <span className="bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-transparent">
            KNIFE
          </span>
          <br />
          <span className="bg-gradient-to-b from-red-300 via-red-500 to-red-700 bg-clip-text text-transparent">
            SMASH
          </span>
        </h1>
        <div className="flex items-center justify-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70">
          <SkinPreview skinId={equippedSkinId} small />
          Equipped
        </div>
        {data.bestLevel > 1 && (
          <div className="text-xs font-bold uppercase tracking-widest text-white/50">
            Best: Level {data.bestLevel}
          </div>
        )}
      </div>

      <div className="relative z-10 flex w-full max-w-xs flex-col gap-3">
        <PrimaryBtn onClick={onPlay}>▶ Play</PrimaryBtn>
        <div className="grid grid-cols-2 gap-3">
          <SecondaryBtn onClick={onShop}>🗡 Shop</SecondaryBtn>
          <SecondaryBtn onClick={onScores}>🏆 Scores</SecondaryBtn>
        </div>
        <div className="mt-2 text-center text-xs text-white/40">
          Tap or Space to throw · P to pause · M to mute
        </div>
        <div className="mt-4 text-center text-[11px] leading-relaxed text-white/45">
          Designed and developed by <span className="font-semibold text-white/70">Md. Asadullah Hil Galib</span>
          <br />
          Founder of <span className="font-semibold text-amber-300/90">SoftCT.com</span>
        </div>
      </div>
    </div>
  );
}

function Overlay({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div
        className={`w-full ${wide ? "max-w-md" : "max-w-xs"} rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-6 shadow-2xl animate-[pop_0.25s_ease-out]`}
      >
        {children}
      </div>
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-center text-3xl font-black text-transparent">
      {children}
    </h2>
  );
}

function PrimaryBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 py-3 text-lg font-black text-slate-900 shadow-[0_6px_0_rgba(180,120,20,1)] transition active:translate-y-1 active:shadow-[0_2px_0_rgba(180,120,20,1)]"
    >
      {children}
    </button>
  );
}
function SecondaryBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-white/15 bg-white/5 py-2.5 text-sm font-bold text-white/90 backdrop-blur transition hover:bg-white/10 active:scale-95"
    >
      {children}
    </button>
  );
}
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">{label}</div>
      <div className="text-xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function CoinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="inline-block">
      <circle cx="12" cy="12" r="10" fill="#ffd452" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#7a4a10" strokeWidth="1.5" />
      <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="900" fill="#7a4a10">$</text>
    </svg>
  );
}

function SkinPreview({ skinId, small = false }: { skinId: string; small?: boolean }) {
  const skin = SKINS.find((s) => s.id === skinId) ?? SKINS[0];
  const w = small ? 20 : 40;
  const h = small ? 40 : 80;
  return (
    <svg width={w} height={h} viewBox="0 0 20 90">
      <defs>
        <linearGradient id={`bg-${skinId}`} x1="0" x2="1">
          <stop offset="0%" stopColor={skin.bladeGrad[0]} />
          <stop offset="100%" stopColor={skin.bladeGrad[1]} />
        </linearGradient>
      </defs>
      {skin.glow && (
        <ellipse cx="10" cy="25" rx="8" ry="20" fill={skin.glow} opacity="0.3" />
      )}
      <polygon points="10,2 15,12 15,48 5,48 5,12" fill={`url(#bg-${skinId})`} />
      <rect x="0" y="48" width="20" height="5" fill={skin.guard} />
      <rect x="6" y="53" width="8" height="28" fill={skin.handle} />
      <circle cx="10" cy="83" r="5" fill={skin.guard} />
    </svg>
  );
}
