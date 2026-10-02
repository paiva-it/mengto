import { MetalFx } from 'metal-fx';
import { useEffect, useRef, useState } from 'react';

import type { ComponentProps, KeyboardEvent } from 'react';

// ponytail: every MetalFx shares one GL program, so the preset is global — one preset ("chromatic") for the whole page.
const PRESET = 'chromatic' as const;
// The page is dark-only; pin the theme instead of following the OS (skill: use app theme state, not auto).
const THEME = 'dark' as const;

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
};

// metal-fx decides WebGL2 support during render, so its server HTML (fallback) never matches the client.
// Render the same plain fallback on the server and first client pass, then mount the real ring.
// Also (2.0.11): an instance paused while still offscreen freezes its first frame at full opacity,
// ignoring `strength` — so `paused` only takes effect once the ring has been on screen for a moment.
const Metal = ({ paused, ...props }: ComponentProps<typeof MetalFx>) => {
  const [mounted, setMounted] = useState(false);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const el = ref.current;
    if (!mounted || !el) {
      return;
    }
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        timer = window.setTimeout(() => setSeen(true), 600);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [mounted]);
  if (!mounted) {
    return (
      <div className={`metal-fx-fallback ${props.className ?? ''}`} style={{ display: 'inline-flex' }}>
        {props.children}
      </div>
    );
  }
  return <MetalFx ref={ref} paused={seen && paused} {...props} />;
};

const useHot = () => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return {
    hot: hovered || focused,
    handlers: {
      onBlur: () => setFocused(false),
      onFocus: () => setFocused(true),
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
    },
  };
};

/* ─── Hero actions: the one primary CTA carries the metal; the ghost link catches its reflection ─── */

const HeroActions = () => {
  const reduced = useReducedMotion();
  const ghostRef = useRef<HTMLAnchorElement>(null);
  return (
    <div className="an-actions">
      <Metal
        className="an-cta-frame"
        disableGlow={reduced}
        normalizeHostStyles={false}
        paused={reduced}
        preset={PRESET}
        reflectionTargets={[ghostRef]}
        ringCssPx={1.5}
        strength={0.9}
        theme={THEME}
      >
        <a className="an-cta" href="#report">
          <span aria-hidden="true" className="an-pulse" />
          Report an active incident
        </a>
      </Metal>
      <a ref={ghostRef} className="an-ghost" href="#retainers">
        Retainer plans
      </a>
    </div>
  );
};

/* ─── Response console: framed card + phase tabs where only the selected tab is fully lit ─── */

type Phase = {
  id: string;
  label: string;
  window: string;
  events: { at: string; text: string }[];
  metrics: { k: string; v: string }[];
};

const PHASES: Phase[] = [
  {
    id: 'detect',
    label: 'Detect',
    window: 'T+00:00 → 00:38',
    events: [
      { at: '02:14', text: 'Impossible-travel sign-in on svc-backup — Lagos to Rotterdam in six minutes.' },
      { at: '02:19', text: 'Kerberoasting burst: 212 service-ticket requests from WS-0447.' },
      { at: '02:31', text: 'Responder on the bridge; EDR telemetry streaming to our console.' },
      { at: '02:52', text: 'Scope fixed: 3 accounts, 9 hosts, one finance file share.' },
    ],
    metrics: [
      { k: 'Time to bridge', v: '17 min' },
      { k: 'Alerts triaged', v: '1,184' },
      { k: 'True positives', v: '6' },
    ],
  },
  {
    id: 'contain',
    label: 'Contain',
    window: 'T+00:38 → 01:10',
    events: [
      { at: '03:05', text: 'svc-backup disabled and every ticket it held revoked.' },
      { at: '03:11', text: '14 hosts isolated at the switch port, not only in the EDR agent.' },
      { at: '03:22', text: 'Outbound beacon to the command server sinkholed at the edge.' },
      { at: '03:40', text: 'Re-entry attempt over VPN refused — MFA fatigue push denied by on-call.' },
    ],
    metrics: [
      { k: 'Hosts isolated', v: '14 / 14' },
      { k: 'Attacker dwell', v: '3 h 12 m' },
      { k: 'Egress after 03:22', v: '0 MB' },
    ],
  },
  {
    id: 'eradicate',
    label: 'Eradicate',
    window: 'T+01:10 → 09:30',
    events: [
      { at: '05:10', text: 'krbtgt rotated twice, ten hours apart, to void any forged tickets.' },
      { at: '06:02', text: 'Scheduled-task persistence pulled from nine hosts.' },
      { at: '07:45', text: 'Web shell found in /portal/upload and removed with its loader.' },
      { at: '11:30', text: 'Hunt across all 2,300 endpoints returns clean.' },
    ],
    metrics: [
      { k: 'Persistence removed', v: '11 items' },
      { k: 'Endpoints hunted', v: '2,300' },
      { k: 'Credentials reset', v: '418' },
    ],
  },
  {
    id: 'recover',
    label: 'Recover',
    window: 'T+09:30 → 14:00',
    events: [
      { at: '09:50', text: 'Backups verified offline before a single restore began.' },
      { at: '11:40', text: 'Payroll back online, ahead of the 14:00 run.' },
      { at: '16:00', text: 'Board brief delivered: two pages, no acronyms.' },
      { at: '17:20', text: 'GDPR Art. 33 notice drafted with counsel, 58 h inside the window.' },
    ],
    metrics: [
      { k: 'Ransom paid', v: '€0' },
      { k: 'Payroll delay', v: 'none' },
      { k: 'Report readers', v: '3' },
    ],
  },
];

const PhaseTab = ({
  phase,
  selected,
  onSelect,
  onKey,
  reduced,
}: {
  phase: Phase;
  selected: boolean;
  onSelect: () => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
  reduced: boolean;
}) => {
  const { hot, handlers } = useHot();
  const lit = selected || hot;
  return (
    <Metal
      className="an-tab-frame"
      disableGlow={reduced || !selected}
      normalizeHostStyles={false}
      paused={reduced || !lit}
      preset={PRESET}
      ringCssPx={selected ? 1.5 : 1}
      strength={selected ? 0.9 : hot ? 0.5 : 0.12}
      theme={THEME}
    >
      <button
        aria-controls="an-phase-panel"
        aria-selected={selected}
        className="an-tab"
        data-phase={phase.id}
        id={`an-tab-${phase.id}`}
        role="tab"
        tabIndex={selected ? 0 : -1}
        type="button"
        onClick={onSelect}
        onKeyDown={onKey}
        {...handlers}
      >
        {phase.label}
      </button>
    </Metal>
  );
};

const ResponseConsole = () => {
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(1);
  const phase = PHASES[current];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    const jump = { Home: 0, End: PHASES.length - 1 }[e.key];
    if (step === undefined && jump === undefined) {
      return;
    }
    e.preventDefault();
    const next = jump ?? (current + step! + PHASES.length) % PHASES.length;
    setCurrent(next);
    document.getElementById(`an-tab-${PHASES[next].id}`)?.focus();
  };

  return (
    <Metal
      borderRadius={22}
      className="an-console-frame"
      disableGlow
      normalizeHostStyles={false}
      paused={reduced}
      preset={PRESET}
      ringCssPx={1.25}
      shaderScale={14}
      strength={0.7}
      theme={THEME}
    >
      <article aria-label="Live engagement console" className="an-console">
        <header className="an-console-head">
          <div>
            <p className="an-mono an-dim">Live engagement · INC-2291</p>
            <h2>Credential theft → lateral movement</h2>
            <p className="an-mono an-dim">Logistics client · 2,300 endpoints · 3 sites</p>
          </div>
          <span className="an-status an-mono">
            <span aria-hidden="true" className="an-dot" />
            {phase.id === 'recover' ? 'Closed' : 'Active'}
          </span>
        </header>

        <div aria-label="Response phase" className="an-tabs" role="tablist">
          {PHASES.map((p, i) => (
            <PhaseTab
              key={p.id}
              phase={p}
              reduced={reduced}
              selected={i === current}
              onKey={onKey}
              onSelect={() => setCurrent(i)}
            />
          ))}
        </div>

        <div aria-labelledby={`an-tab-${phase.id}`} className="an-panel" id="an-phase-panel" role="tabpanel">
          <p className="an-window an-mono">
            <span className="an-dim">Window</span> {phase.window}
          </p>
          <ol className="an-events">
            {phase.events.map((ev) => (
              <li key={ev.at + ev.text}>
                <time className="an-mono">{ev.at}</time>
                <span>{ev.text}</span>
              </li>
            ))}
          </ol>
          <dl className="an-metrics">
            {phase.metrics.map((m) => (
              <div key={m.k}>
                <dt className="an-mono an-dim">{m.k}</dt>
                <dd>{m.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </article>
    </Metal>
  );
};

/* ─── Retainer picker: a radio group whose checked card is the only metal surface ─── */

const PLANS = [
  {
    id: 'tripwire',
    name: 'Tripwire',
    price: '€4.8k',
    pitch: 'For teams with their own SOC who need a second pair of hands at 3 a.m.',
    lines: ['40 response hours a year', 'Responder on the bridge in 4 h', 'Annual tabletop exercise'],
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    price: '€11k',
    pitch: 'Our most-held retainer: we know your network before anything happens to it.',
    lines: ['160 response hours a year', 'Bridge in 40 min, on site in 6 h', 'Quarterly purple-team week'],
  },
  {
    id: 'bastion',
    name: 'Bastion',
    price: '€26k',
    pitch: 'An Anneal responder embedded with your team, two days a week, all year.',
    lines: ['Uncapped response hours', 'Named lead + deputy, always reachable', 'Full adversary emulation each spring'],
  },
];

const PlanCard = ({
  plan,
  checked,
  onSelect,
  onKey,
  reduced,
}: {
  plan: (typeof PLANS)[number];
  checked: boolean;
  onSelect: () => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
  reduced: boolean;
}) => {
  const { hot, handlers } = useHot();
  return (
    <Metal
      borderRadius={20}
      className="an-plan-frame"
      disableGlow
      normalizeHostStyles={false}
      paused={reduced || !(checked || hot)}
      preset={PRESET}
      ringCssPx={checked ? 1.5 : 1}
      shaderScale={10}
      strength={checked ? 0.9 : hot ? 0.35 : 0.06}
      theme={THEME}
    >
      <button
        aria-checked={checked}
        className="an-plan"
        id={`an-plan-${plan.id}`}
        role="radio"
        tabIndex={checked ? 0 : -1}
        type="button"
        onClick={onSelect}
        onKeyDown={onKey}
        {...handlers}
      >
        <span className="an-plan-top">
          <span className="an-plan-name">{plan.name}</span>
          <span aria-hidden="true" className="an-radio" />
        </span>
        <span className="an-plan-price">
          {plan.price}
          <small className="an-dim"> / month</small>
        </span>
        <span className="an-plan-pitch">{plan.pitch}</span>
        <span className="an-plan-lines">
          {plan.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      </button>
    </Metal>
  );
};

const RetainerPicker = () => {
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(1);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step === undefined) {
      return;
    }
    e.preventDefault();
    const next = (current + step + PLANS.length) % PLANS.length;
    setCurrent(next);
    document.getElementById(`an-plan-${PLANS[next].id}`)?.focus();
  };
  return (
    <div className="an-plans-wrap">
      <div aria-label="Retainer plan" className="an-plans" role="radiogroup">
        {PLANS.map((p, i) => (
          <PlanCard
            key={p.id}
            checked={i === current}
            plan={p}
            reduced={reduced}
            onKey={onKey}
            onSelect={() => setCurrent(i)}
          />
        ))}
      </div>
      <p aria-live="polite" className="an-plan-summary an-mono">
        Selected: <strong>{PLANS[current].name}</strong> · {PLANS[current].lines[1]} · billed annually, cancel at renewal
      </p>
    </div>
  );
};

export { HeroActions, ResponseConsole, RetainerPicker };
