/**
 * CrazyGames SDK v3 — safe wrapper.
 *
 * Design goals:
 *  - NEVER throw / never halt game execution, even if:
 *      • the CDN script failed to load (offline, blocked, local file testing)
 *      • the SDK is present but a method throws or is missing
 *      • init() rejects or hangs
 *  - Provide a tiny, game-focused API (init, gameplayStart/Stop, loadingStart/Stop,
 *    happytime) plus optional ads with graceful fallbacks.
 *
 * Because the game may be run locally (not yet uploaded to CrazyGames), the SDK
 * will often be unavailable. In that case every method becomes a harmless no-op.
 */

type AdType = "midgame" | "rewarded";

interface CrazyGameModule {
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  loadingStart?: () => void;
  loadingStop?: () => void;
  happytime?: () => void;
}

interface CrazyAdModule {
  requestAd?: (
    type: AdType,
    callbacks?: {
      adStarted?: () => void;
      adFinished?: () => void;
      adError?: (err: unknown) => void;
    },
  ) => void;
}

interface CrazySDKType {
  init?: () => Promise<unknown>;
  game?: CrazyGameModule;
  ad?: CrazyAdModule;
  environment?: string;
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySDKType };
    __CRAZY_SDK_FAILED__?: boolean;
  }
}

let initialized = false;
let initPromise: Promise<boolean> | null = null;
let available = false;

// A generic, swallow-everything guard used for every SDK call.
function safe<T>(fn: () => T, label: string): T | undefined {
  try {
    return fn();
  } catch (err) {
    // Log but never rethrow — a failing analytics call must not break gameplay.
    if (typeof console !== "undefined") {
      console.warn(`[CrazySDK] ${label} failed (ignored):`, err);
    }
    return undefined;
  }
}

function getSDK(): CrazySDKType | null {
  try {
    return window?.CrazyGames?.SDK ?? null;
  } catch {
    return null;
  }
}

/**
 * Initialize the SDK. Resolves to `true` if the SDK is usable, `false` otherwise.
 * Safe to call multiple times — it only initializes once. It races against a
 * timeout so a hanging/missing SDK never blocks the game from starting.
 */
export function initCrazySdk(timeoutMs = 4000): Promise<boolean> {
  if (initPromise) return initPromise;

  initPromise = new Promise<boolean>((resolve) => {
    // Script explicitly failed to load (onerror in index.html).
    if (typeof window !== "undefined" && window.__CRAZY_SDK_FAILED__) {
      available = false;
      initialized = true;
      resolve(false);
      return;
    }

    const sdk = getSDK();
    if (!sdk || typeof sdk.init !== "function") {
      // SDK not present (local dev / not uploaded yet). Run in no-op mode.
      available = false;
      initialized = true;
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      available = ok;
      initialized = true;
      resolve(ok);
    };

    // Guard against init() hanging forever.
    const timer = setTimeout(() => finish(false), timeoutMs);

    try {
      const p = sdk.init();
      if (p && typeof (p as Promise<unknown>).then === "function") {
        (p as Promise<unknown>)
          .then(() => {
            clearTimeout(timer);
            finish(true);
          })
          .catch((err) => {
            clearTimeout(timer);
            console.warn("[CrazySDK] init() rejected (ignored):", err);
            finish(false);
          });
      } else {
        // Non-promise return — assume synchronous success.
        clearTimeout(timer);
        finish(true);
      }
    } catch (err) {
      clearTimeout(timer);
      console.warn("[CrazySDK] init() threw (ignored):", err);
      finish(false);
    }
  });

  return initPromise;
}

export function isCrazyAvailable(): boolean {
  return initialized && available;
}

function game(): CrazyGameModule | null {
  if (!available) return null;
  const sdk = getSDK();
  return sdk?.game ?? null;
}

// --- Activity events (analytics / resource management on the CG site) ---

/** Call when real gameplay starts or resumes (start, resume, revive, next level). */
export function gameplayStart(): void {
  const g = game();
  if (g?.gameplayStart) safe(() => g.gameplayStart!(), "gameplayStart");
}

/** Call on every break: menu, pause, level clear screen, game over. */
export function gameplayStop(): void {
  const g = game();
  if (g?.gameplayStop) safe(() => g.gameplayStop!(), "gameplayStop");
}

/** Call when starting to load additional content. */
export function loadingStart(): void {
  const g = game();
  if (g?.loadingStart) safe(() => g.loadingStart!(), "loadingStart");
}

/** Call when loading finishes and gameplay is about to begin. */
export function loadingStop(): void {
  const g = game();
  if (g?.loadingStop) safe(() => g.loadingStop!(), "loadingStop");
}

/** Celebration effect on the CG site (boss beaten, new high score, etc). */
export function happytime(): void {
  const g = game();
  if (g?.happytime) safe(() => g.happytime!(), "happytime");
}

// --- Ads (optional, fully guarded with fallback) ---

/**
 * Request an ad. If the SDK/ads are unavailable, the fallbacks run immediately
 * so the game flow (e.g. reviving, continuing) never stalls.
 */
export function requestAd(
  type: AdType,
  handlers: {
    onStart?: () => void;
    onFinish?: () => void;
    onError?: () => void;
  } = {},
): void {
  const { onStart, onFinish, onError } = handlers;
  const sdk = getSDK();
  const ad = available ? sdk?.ad : null;

  if (!ad || typeof ad.requestAd !== "function") {
    // No ads available — treat as "no ad shown" and continue gracefully.
    safe(() => onError?.(), "ad.onError(fallback)");
    return;
  }

  safe(
    () =>
      ad.requestAd!(type, {
        adStarted: () => safe(() => onStart?.(), "ad.onStart"),
        adFinished: () => safe(() => onFinish?.(), "ad.onFinish"),
        adError: () => safe(() => onError?.(), "ad.onError"),
      }),
    "requestAd",
  );
}
