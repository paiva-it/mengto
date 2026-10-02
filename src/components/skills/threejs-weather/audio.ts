// Weather ambience: one gain bus for weather, a rain bed and a wind layer that swells over it
// (never a cross-fade to another clip), and thunder bursts. All generated — no files.

// Generated noise never loops cleanly: fold the tail back over the head with an equal-power
// cross-fade and drop the overlap, so the clip ends exactly where it starts.
const seamless = (ctx: AudioContext, seconds: number, foldSeconds: number, brown: boolean) => {
  const n = Math.floor(ctx.sampleRate * seconds);
  const f = Math.floor(ctx.sampleRate * foldSeconds);
  const a = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      a[i] = last * 3.5;
    } else {
      a[i] = w * 0.5;
    }
  }
  const buf = ctx.createBuffer(1, n - f, ctx.sampleRate);
  const out = buf.getChannelData(0);
  for (let i = 0; i < n - f; i++) out[i] = a[i];
  for (let i = 0; i < f; i++) {
    const t = i / f;
    out[i] = a[i] * Math.sin((t * Math.PI) / 2) + a[n - f + i] * Math.cos((t * Math.PI) / 2);
  }
  return buf;
};

class Ambience {
  on = false;
  private ctx?: AudioContext;
  private bus?: GainNode;
  private rain?: GainNode;
  private wind?: GainNode;

  toggle() {
    if (!this.ctx) this.start();
    this.on = !this.on;
    if (this.on) void this.ctx!.resume();
    this.bus!.gain.setTargetAtTime(this.on ? 0.9 : 0, this.ctx!.currentTime, 0.25);
    return this.on;
  }

  /** rain 0..1 (drops drawn × speed), wind 0..1 (blizzard / storm gusts). Called a few times a second. */
  set(rain: number, wind: number) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.rain!.gain.setTargetAtTime(rain * 0.42, t, 0.6);
    this.wind!.gain.setTargetAtTime(wind * 0.55, t, 1.2);
  }

  /** near 0 = distant (low, soft, long), 1 = close (bright crack, loud). */
  thunder(near: number) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx;
    const len = 2.4 + (1 - near) * 2;
    const n = Math.floor(ctx.sampleRate * len);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const tau = 0.45 + (1 - near) * 1.1;
    let last = 0;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      last = (last + 0.06 * (Math.random() * 2 - 1)) / 1.06;
      const roll = 1 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
      d[i] = last * 6 * Math.exp(-t / tau) * roll * Math.min(1, t / (0.01 + (1 - near) * 0.25));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180 + near * 900;
    const g = ctx.createGain();
    g.gain.value = 0.3 + near * 0.6;
    src.connect(lp).connect(g).connect(this.bus!);
    src.start();
  }

  private start() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(ctx.destination);

    const loop = (buf: AudioBuffer, filters: BiquadFilterNode[]) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      let node: AudioNode = src;
      for (const f of filters) node = node.connect(f);
      node.connect(g).connect(this.bus!);
      src.start();
      return g;
    };
    const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };
    this.rain = loop(seamless(ctx, 5, 0.8, false), [filter('highpass', 700), filter('lowpass', 7000)]);
    this.wind = loop(seamless(ctx, 7, 1.2, true), [filter('bandpass', 420, 0.6)]);
  }
}

export { Ambience };
