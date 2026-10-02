import { BorderBeam } from 'border-beam';
import { useEffect, useRef, useState } from 'react';

import type { FormEvent, KeyboardEvent } from 'react';

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
};

// Animate only the newly selected item for ~1 s, then keep the static selected style (skill: large collections).
const useFlash = (ms = 1100) => {
  const [flashId, setFlashId] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const flash = (id: string) => {
    window.clearTimeout(timer.current);
    setFlashId(id);
    timer.current = window.setTimeout(() => setFlashId(null), ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [flashId, flash] as const;
};

/* ───────────────────────── Hero: telescope console ───────────────────────── */

type Target = { id: string; name: string; cat: string; kind: string; ra: string; dec: string; alt: string; mag: string; slew: number };

const TARGETS: Target[] = [
  { id: 'm31', name: 'Andromeda Galaxy', cat: 'M31', kind: 'Spiral galaxy · 2.5 million ly', ra: '00h 42m 44s', dec: '+41° 16′ 09″', alt: '62°', mag: '3.4', slew: 7.2 },
  { id: 'saturn', name: 'Saturn', cat: 'Planet', kind: 'Rings open 4.1° · Titan east', ra: '00h 29m 51s', dec: '−02° 03′ 40″', alt: '34°', mag: '0.7', slew: 4.2 },
  { id: 'albireo', name: 'Albireo', cat: 'β Cyg', kind: 'Gold and blue double · 35″ apart', ra: '19h 30m 43s', dec: '+27° 57′ 35″', alt: '48°', mag: '3.1', slew: 3.6 },
  { id: 'm57', name: 'Ring Nebula', cat: 'M57', kind: 'Planetary nebula in Lyra', ra: '18h 53m 35s', dec: '+33° 01′ 45″', alt: '41°', mag: '8.8', slew: 3.2 },
];

// Deterministic integer LCG star field so SSR and client agree exactly (Math.sin differs across engines).
let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.round((seed / 2147483648) * 1000) / 1000;
};
const STARS = Array.from({ length: 70 }, () => {
  const [x, y, s, o] = [rand(), rand(), rand(), rand()];
  return { x: Math.round(x * 2000) / 10, y: Math.round(y * 2000) / 10, s: Math.round((0.3 + s * s * 1.6) * 100) / 100, o: Math.round((0.25 + o * 0.75) * 100) / 100 };
});

const TelescopeConsole = () => {
  const reduce = useReducedMotion();
  const [selectedId, setSelectedId] = useState('m31');
  const [slewing, setSlewing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [flashId, flash] = useFlash();
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const target = TARGETS.find((t) => t.id === selectedId) ?? TARGETS[0];

  useEffect(() => {
    if (!slewing) {
      return;
    }
    const start = performance.now();
    const total = target.slew * 1000;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / total);
      setProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setSlewing(false);
      flash(target.id);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slewing, target.id]);

  const choose = (id: string) => {
    if (id === selectedId && !slewing) {
      return;
    }
    setSelectedId(id);
    setProgress(0);
    setSlewing(true);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move) {
      event.preventDefault();
      optionRefs.current[(index + move + TARGETS.length) % TARGETS.length]?.focus();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(TARGETS[index].id);
    }
  };

  const pct = Math.round(progress * 100);

  return (
    <BorderBeam
      active={slewing && !reduce}
      borderRadius={22}
      className="kh-beam-card"
      colorVariant="ocean"
      duration={2.6}
      size="pulse-inner"
      strength={0.75}
      theme="dark"
    >
      <section aria-busy={slewing} aria-label="Telescope 2 console" className="kh-console" data-state={slewing ? 'loading' : 'idle'}>
        <header className="kh-console-head">
          <div>
            <p className="kh-mono kh-dim">Dome B · Telescope 2</p>
            <p className="kh-console-title">0.6 m Ritchey–Chrétien</p>
          </div>
          <p className="kh-pill" data-live={slewing ? 'busy' : 'ready'}>
            <span aria-hidden="true" className="kh-dot" />
            {slewing ? 'Slewing' : 'Tracking'}
          </p>
        </header>

        <div className="kh-scope">
          <div aria-hidden="true" className="kh-finder" data-slewing={slewing}>
            <svg viewBox="0 0 200 200">
              <g className="kh-finder-stars">
                {STARS.map((s, i) => (
                  <circle key={i} cx={s.x} cy={s.y} fill="#fff" fillOpacity={s.o} r={s.s} />
                ))}
                <ellipse cx="100" cy="100" fill="url(#kh-core)" rx="34" ry="11" transform="rotate(-32 100 100)" />
              </g>
              <defs>
                <radialGradient id="kh-core">
                  <stop offset="0" stopColor="#dfe6ff" stopOpacity="0.9" />
                  <stop offset="0.35" stopColor="#9fb1ff" stopOpacity="0.35" />
                  <stop offset="1" stopColor="#9fb1ff" stopOpacity="0" />
                </radialGradient>
              </defs>
              <g fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.6">
                <circle cx="100" cy="100" r="96" />
                <circle cx="100" cy="100" r="20" strokeDasharray="2 3" />
                <path d="M100 4v70M100 126v70M4 100h70M126 100h70" />
              </g>
            </svg>
          </div>
          <dl className="kh-readout">
            <div className="kh-readout-name">
              <dt className="kh-mono kh-dim">{slewing ? 'Slewing to' : 'Locked on'}</dt>
              <dd>
                {target.name} <span className="kh-dim">{target.cat}</span>
              </dd>
            </div>
            <div>
              <dt className="kh-mono kh-dim">RA</dt>
              <dd className="kh-mono">{target.ra}</dd>
            </div>
            <div>
              <dt className="kh-mono kh-dim">Dec</dt>
              <dd className="kh-mono">{target.dec}</dd>
            </div>
            <div>
              <dt className="kh-mono kh-dim">Altitude</dt>
              <dd className="kh-mono">{target.alt}</dd>
            </div>
            <div>
              <dt className="kh-mono kh-dim">Mag</dt>
              <dd className="kh-mono">{target.mag}</dd>
            </div>
          </dl>
        </div>

        <div className="kh-progress-row">
          <p className="kh-status" role="status">
            {slewing ? `Moving the mount to ${target.cat} — dome shutter following` : `On target. Eyepiece is yours from 21:48 to 21:56.`}
          </p>
          <span className="kh-mono kh-dim">{slewing ? `${pct}%` : 'Sidereal'}</span>
        </div>
        <div aria-hidden="true" className="kh-bar">
          <span style={{ transform: `scaleX(${slewing ? progress : 1})` }} />
        </div>

        <div aria-label="Tonight’s targets" className="kh-targets" role="listbox">
          {TARGETS.map((t, i) => {
            const selected = t.id === selectedId;
            return (
              <BorderBeam
                key={t.id}
                active={flashId === t.id && !slewing && !reduce}
                borderRadius={12}
                className="kh-beam-card"
                colorVariant="mono"
                duration={4.2}
                role="presentation"
                size="md"
                staticColors
                strength={0.5}
              >
                <div
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  aria-selected={selected}
                  className="kh-target"
                  role="option"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(t.id)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <span className="kh-target-cat kh-mono">{t.cat}</span>
                  <span className="kh-target-name">{t.name}</span>
                  <span className="kh-target-kind kh-dim">{t.kind}</span>
                  <span className="kh-mono kh-dim kh-target-alt">{t.alt}</span>
                </div>
              </BorderBeam>
            );
          })}
        </div>
      </section>
    </BorderBeam>
  );
};

/* ───────────────────────── Ask the sky: line beam ───────────────────────── */

type Answer = { name: string; where: string; note: string };

const ANSWERS: Record<string, Answer[]> = {
  planet: [
    { name: 'Saturn', where: 'SE · 34°', note: 'Best before midnight; rings still nearly edge-on.' },
    { name: 'Jupiter', where: 'E · 9°', note: 'Clears the ridge trees around 23:40.' },
    { name: 'Uranus', where: 'E · 28°', note: 'A pale green disc at 180×, under the Pleiades.' },
  ],
  default: [
    { name: 'Andromeda Galaxy', where: 'NE · 62°', note: 'Naked-eye from the car park once your eyes adapt.' },
    { name: 'Albireo', where: 'W · 48°', note: 'The prettiest double star we own. Gold and blue.' },
    { name: 'Ring Nebula', where: 'W · 41°', note: 'Small and grey — ask the operator for the 300× view.' },
  ],
};

const SkyQuery = () => {
  const reduce = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState('What’s above the ridge at 22:00?');
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const timer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim() || pending) {
      return;
    }
    setPending(true);
    // Real lookups take ~1.5 s; never flash the beam for less than ~500 ms.
    timer.current = window.setTimeout(() => {
      setAnswers(/planet|saturn|jupiter/i.test(query) ? ANSWERS.planet : ANSWERS.default);
      setPending(false);
    }, 1600);
  };

  const cancel = () => {
    window.clearTimeout(timer.current);
    setPending(false);
  };

  // Loading above focus (skill: resolve overlapping states explicitly).
  const state = pending ? 'loading' : focused ? 'focus' : 'idle';
  const beam =
    state === 'loading'
      ? ({ colorVariant: 'ocean', duration: 2.4, strength: 0.7 } as const)
      : ({ colorVariant: 'mono', duration: 3.1, staticColors: true, strength: 0.45 } as const);

  return (
    <div className="kh-ask">
      <BorderBeam
        {...beam}
        active={state !== 'idle' && !reduce}
        borderRadius={16}
        className="kh-beam-card"
        size="line"
        onBlurCapture={(e) => {
          const next = e.relatedTarget as Node | null;
          if (!next || !e.currentTarget.contains(next)) {
            setFocused(false);
          }
        }}
        onFocusCapture={() => setFocused(true)}
      >
        <form aria-busy={pending} className="kh-ask-bar" data-state={state} onSubmit={submit}>
          <label className="kh-sr" htmlFor="kh-ask-input">
            Ask the sky
          </label>
          <svg aria-hidden="true" className="kh-ask-icon" height="18" viewBox="0 0 18 18" width="18">
            <circle cx="9" cy="9" fill="none" r="7.25" stroke="currentColor" strokeOpacity="0.5" />
            <path d="M9 1.5v3M9 13.5v3M1.5 9h3M13.5 9h3" stroke="currentColor" />
          </svg>
          <input id="kh-ask-input" autoComplete="off" disabled={pending} value={query} onChange={(e) => setQuery(e.target.value)} />
          {pending ? (
            <button className="kh-btn kh-btn-ghost" type="button" onClick={cancel}>
              Cancel
            </button>
          ) : (
            <button className="kh-btn" type="submit">
              Ask
            </button>
          )}
        </form>
      </BorderBeam>
      <p aria-live="polite" className="kh-ask-status kh-mono" role="status">
        {pending ? 'Reading tonight’s ephemeris and the ridge horizon mask…' : answers ? `${answers.length} objects above the trees` : 'Try “planets after 23:00”'}
      </p>
      <ul className="kh-answers" data-pending={pending}>
        {(answers ?? ANSWERS.default).map((a) => (
          <li key={a.name}>
            <span className="kh-answer-name">{a.name}</span>
            <span className="kh-mono kh-dim">{a.where}</span>
            <span className="kh-dim kh-answer-note">{a.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ───────────────────────── Dome tonight: pulse-outside + toggles ───────────────────────── */

const SHOWS = [
  { id: 'voyagers', time: '20:15', title: 'Two Voyagers, Still Talking', note: '35 min · all ages · narrated live' },
  { id: 'aurora', time: '21:30', title: 'Why the Sky Turns Green', note: '40 min · aurora science · 10+' },
  { id: 'deep', time: '22:45', title: 'Deep Field, Slowly', note: '50 min · no narration · late session' },
];

const DomeTonight = () => {
  const reduce = useReducedMotion();
  const [saved, setSaved] = useState<string[]>(['aurora']);
  const [flashId, flash] = useFlash(1000);

  const toggle = (id: string) => {
    const on = !saved.includes(id);
    setSaved((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
    if (on) {
      flash(id);
    }
  };

  return (
    <div className="kh-dome">
      <div className="kh-live-wrap">
        <BorderBeam active={!reduce} borderRadius={22} className="kh-beam-card" colorVariant="sunset" duration={3} size="pulse-outside" strength={0.55}>
          <article aria-labelledby="kh-live-title" className="kh-live">
            <p className="kh-pill" data-live="live">
              <span aria-hidden="true" className="kh-dot" />
              In the dome now
            </p>
            <h3 id="kh-live-title">The Long Night of Andromeda</h3>
            <p className="kh-dim">Started 19:00 · ends 19:45. Latecomers enter by the red lamp on the north door; the lights stay down.</p>
            <a className="kh-btn" href="#grammar">
              Doors close in 4 min
            </a>
          </article>
        </BorderBeam>
      </div>
      <ul aria-label="Later in the dome" className="kh-shows">
        {SHOWS.map((s) => {
          const on = saved.includes(s.id);
          return (
            <li key={s.id}>
              <BorderBeam
                active={flashId === s.id && !reduce}
                borderRadius={18}
                className="kh-beam-card"
                colorVariant="mono"
                duration={4.4}
                size="md"
                staticColors
                strength={0.42}
              >
                <div className="kh-show" data-state={on ? 'selected' : 'idle'}>
                  <span className="kh-mono kh-show-time">{s.time}</span>
                  <span className="kh-show-title">{s.title}</span>
                  <span className="kh-dim kh-show-note">{s.note}</span>
                  <button aria-pressed={on} className="kh-toggle" type="button" onClick={() => toggle(s.id)}>
                    {on ? 'On my night' : 'Add to my night'}
                  </button>
                </div>
              </BorderBeam>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export { DomeTonight, SkyQuery, TelescopeConsole };
