// Tiny WebAudio synth for satisfying feedback
let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.15,
  slideTo?: number,
) {
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo !== undefined) {
    o.frequency.exponentialRampToValueAtTime(
      Math.max(1, slideTo),
      c.currentTime + dur,
    );
  }
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

function noise(dur: number, vol = 0.1, filterFreq = 2000) {
  const c = getCtx();
  if (!c) return;
  const bufferSize = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(filt).connect(g).connect(c.destination);
  src.start();
  src.stop(c.currentTime + dur);
}

export const sfx = {
  throw: () => tone(720, 0.08, "square", 0.08, 340),
  stick: () => {
    tone(180, 0.06, "triangle", 0.14);
    noise(0.05, 0.06, 3000);
  },
  hit: () => {
    noise(0.18, 0.18, 1200);
    tone(90, 0.18, "sawtooth", 0.12, 40);
  },
  coin: () => {
    tone(880, 0.05, "square", 0.1);
    setTimeout(() => tone(1320, 0.08, "square", 0.1), 40);
  },
  apple: () => {
    tone(1200, 0.07, "sine", 0.12, 1800);
    tone(600, 0.1, "triangle", 0.1);
  },
  boss: () => {
    tone(120, 0.2, "sawtooth", 0.14, 60);
    noise(0.2, 0.12, 800);
  },
  levelClear: () => {
    tone(523, 0.1, "square", 0.12);
    setTimeout(() => tone(659, 0.1, "square", 0.12), 90);
    setTimeout(() => tone(784, 0.18, "square", 0.14), 180);
  },
  gameOver: () => {
    tone(400, 0.3, "sawtooth", 0.14, 80);
    setTimeout(() => tone(200, 0.4, "sawtooth", 0.14, 60), 150);
  },
  click: () => tone(660, 0.04, "square", 0.06),
};
