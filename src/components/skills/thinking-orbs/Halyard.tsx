import { useEffect, useState } from 'react';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';

// Product lifecycle kept separate from the visual state (skill: "Model the Product Lifecycle").
type Phase = 'listening' | 'retrieving' | 'reasoning' | 'charting' | 'writing' | 'done';

const ORB_BY_PHASE: Partial<Record<Phase, OrbState>> = {
  listening: 'listening',
  retrieving: 'searching',
  reasoning: 'solving',
  charting: 'shaping',
  writing: 'composing',
};

const STEPS: { phase: Exclude<Phase, 'done'>; title: string; detail: string; meta: string }[] = [
  {
    phase: 'listening',
    title: 'Listening to your brief',
    detail: '“Leaving Falmouth Thursday, two aboard, want Ouessant before dark.”',
    meta: '0:14 voice',
  },
  {
    phase: 'retrieving',
    title: 'Reading tides and forecasts',
    detail: 'Tidal diamonds for the Channel approaches, Plymouth shipping forecast, Brest harbour notices.',
    meta: '23 sources',
  },
  {
    phase: 'reasoning',
    title: 'Weighing departure windows',
    detail: 'Nine windows tested against the ebb, the Ushant separation scheme and nightfall at 19:52.',
    meta: '9 windows',
  },
  {
    phase: 'charting',
    title: 'Drawing the route',
    detail: 'Laying six waypoints clear of the Ushant TSS, with a bail-out into L’Aber Wrac’h.',
    meta: '6 waypoints',
  },
  {
    phase: 'writing',
    title: 'Writing your passage brief',
    detail: 'Pilotage notes, watch plan for two, and the conditions that should make you turn back.',
    meta: '1 page',
  },
];

const ORDER: Phase[] = [...STEPS.map((s) => s.phase), 'done'];
const STEP_MS = 3400;
const DONE_MS = 5200;

const Check = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeOpacity="0.28" />
    <path d="M6 10.4l2.6 2.5L14 7.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PassageConsole = () => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const phase = ORDER[index];
  const state = ORB_BY_PHASE[phase];
  const step = STEPS.find((s) => s.phase === phase);

  useEffect(() => {
    if (paused) {
      return;
    }
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % ORDER.length), phase === 'done' ? DONE_MS : STEP_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, phase]);

  return (
    <div className="ho-console">
      <div className="ho-console-head">
        <div>
          <p className="ho-mono ho-dim">Passage 0412</p>
          <p className="ho-route">Falmouth <span aria-hidden="true">→</span> Île d’Ouessant</p>
        </div>
        <p className="ho-mono ho-dim ho-right">Thu 03 Oct<br />HW Dover −2</p>
      </div>

      <div className="ho-now" role="status" aria-live="polite">
        <div className="ho-well">
          {state ? (
            <ThinkingOrb state={state} size={64} paused={paused} aria-hidden="true" />
          ) : (
            <span className="ho-done-mark" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 30 30"><path d="M8 15.6l4.6 4.4L22.5 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          )}
        </div>
        <div className="ho-now-text">
          <p className="ho-mono ho-brass">{state ? (paused ? `${state} · held for you` : state) : 'brief ready'}</p>
          <p className="ho-now-title">{step ? `${step.title}…` : 'Leave at 05:10 on the ebb.'}</p>
          <p className="ho-now-detail">
            {step ? step.detail : '112 nm · ETA 21:40 · SW 4–5 veering W by evening. Gate at the Chenal du Four opens 18:30.'}
          </p>
        </div>
      </div>

      <ol className="ho-steps">
        {STEPS.map((s, i) => {
          const status = i < index ? 'done' : i === index ? 'active' : 'pending';
          const st = ORB_BY_PHASE[s.phase];
          return (
            <li key={s.phase} className={`ho-step is-${status}`}>
              <span className="ho-step-icon">
                {status === 'active' && st ? (
                  <ThinkingOrb state={st} size={20} paused={paused} aria-hidden="true" />
                ) : status === 'done' ? (
                  <Check />
                ) : (
                  <span className="ho-pending" aria-hidden="true" />
                )}
              </span>
              <span className="ho-step-title">{s.title}</span>
              <span className="ho-mono ho-dim ho-step-meta">{status === 'pending' ? '—' : s.meta}</span>
            </li>
          );
        })}
      </ol>

      <div className="ho-console-foot">
        <button type="button" className="ho-btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused} disabled={!state}>
          {paused ? 'Resume' : 'Hold for review'}
        </button>
        <button
          type="button"
          className="ho-btn ho-btn-ghost"
          onClick={() => {
            setPaused(false);
            setIndex(0);
          }}
        >
          Plan again
        </button>
      </div>
    </div>
  );
};

const GALLERY: { state: OrbState; phase: string; inline: string; note: string }[] = [
  { state: 'listening', phase: 'Voice brief', inline: 'Listening on deck…', note: 'Only while the microphone is open. The orb leaves the moment you stop talking.' },
  { state: 'searching', phase: 'Tides & weather', inline: 'Searching tide tables…', note: 'Retrieval: tidal atlases, forecasts, notices to mariners, your own logbook.' },
  { state: 'solving', phase: 'Window planning', inline: 'Weighing nine windows…', note: 'Reasoning over gates, daylight and crew fatigue. Never a percentage.' },
  { state: 'shaping', phase: 'Route chart', inline: 'Drawing the route…', note: 'A formed output is taking shape: waypoints, legs and bail-out lines.' },
  { state: 'composing', phase: 'Passage brief', inline: 'Writing the brief…', note: 'Text generation: pilotage notes, watch plan, the turn-back list.' },
  { state: 'working', phase: 'Syncing the boat', inline: 'Updating the plotter…', note: 'Generic multi-step work, when no more precise state is true.' },
];

const StateGallery = () => (
  <ul className="ho-gallery">
    {GALLERY.map((g) => (
      <li key={g.state} className="ho-card">
        <div className="ho-card-orb">
          <ThinkingOrb state={g.state} size={64} aria-label={`${g.phase}: ${g.inline}`} />
        </div>
        <p className="ho-mono ho-brass">{g.state}</p>
        <h3 className="ho-card-title">{g.phase}</h3>
        <p className="ho-card-note">{g.note}</p>
        <p className="ho-inline">
          <ThinkingOrb state={g.state} size={20} aria-hidden="true" />
          <span>{g.inline}</span>
        </p>
      </li>
    ))}
  </ul>
);

const OrbLegend = () => (
  <ul className="ho-legend" aria-label="The six states Halyard uses">
    {GALLERY.map((g) => (
      <li key={g.state}>
        <ThinkingOrb state={g.state} size={64} aria-hidden="true" />
        <span className="ho-mono">{g.state}</span>
      </li>
    ))}
  </ul>
);

// Lives inside a data-theme="light" ancestor: theme="auto" flips to dark ink on paper.
const ChartroomThread = () => {
  const [busy, setBusy] = useState(true);
  return (
    <div className="ho-thread">
      <div className="ho-msg ho-msg-you">
        <p>Wind’s backing earlier than forecast. Can we still make the Four before the tide turns?</p>
      </div>
      <div className="ho-msg ho-msg-halyard">
        <div className="ho-avatar">
          {busy ? <ThinkingOrb state="solving" size={64} aria-hidden="true" /> : <span className="ho-avatar-h" aria-hidden="true">H</span>}
        </div>
        <div className="ho-msg-body" role="status" aria-live="polite">
          {busy ? (
            <>
              <p className="ho-mono">solving</p>
              <p>Re-running the 14:00 window against the new wind…</p>
            </>
          ) : (
            <>
              <p className="ho-mono">answer</p>
              <p>Yes, if you’re abeam of Le Four by 18:10. Motor-sail from the Basse Paupian buoy; after 18:40 take L’Aber Wrac’h instead.</p>
            </>
          )}
        </div>
      </div>
      <button type="button" className="ho-btn ho-btn-paper" onClick={() => setBusy((b) => !b)}>
        {busy ? (
          'Show the answer'
        ) : (
          <>
            <ThinkingOrb state="solving" size={20} aria-hidden="true" />
            Ask again
          </>
        )}
      </button>
    </div>
  );
};

export { ChartroomThread, OrbLegend, PassageConsole, StateGallery };
