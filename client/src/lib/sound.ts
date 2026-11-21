/** تنبيه صوتي عبر Web Audio — بدون ملفات صوتية. يبدأ بأول تفاعل من المستخدم. */
let ctx: AudioContext | null = null;

export function ensureAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* المتصفح لا يدعم */
  }
  return ctx;
}

function tone(freq: number, at: number, dur = 0.28) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  o.type = 'sine';
  o.frequency.value = freq;
  const t = ctx.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** صفير مزدوج مميز لطلب جديد */
export function alertBeep() {
  const c = ensureAudio();
  if (!c || c.state !== 'running') return;
  tone(920, 0);
  tone(1240, 0.4);
}
