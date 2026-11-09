/**
 * Optional UI sounds, synthesised with Web Audio (no audio files). Off by default;
 * Settings → Appearance → "Interface sounds".
 */
let enabled = false;
let ctx: AudioContext | null = null;

export const setSoundsEnabled = (v: boolean) => {
  enabled = v;
};

function blip(freq: number, duration: number, volume: number, type: OscillatorType = "triangle") {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    /* audio unavailable */
  }
}

export const click = () => blip(880, 0.05, 0.03);
export const success = () => {
  blip(660, 0.09, 0.04);
  setTimeout(() => blip(990, 0.12, 0.04), 70);
};
export const failure = () => blip(220, 0.18, 0.05, "sawtooth");
