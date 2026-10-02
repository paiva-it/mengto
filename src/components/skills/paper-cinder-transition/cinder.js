/* Paper cinder transition — the skill's own engine (NOISE, EDGE, burn pass, bake, bloom, timing),
   ported from its demo; the scenes, copy and type are Last Credit's (staging). */
function main(){
/* ---- the page's own GLSL (copied, not rewritten) ---- */
const NOISE = String.raw`  vec2 hash2(vec2 p){
    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
    return fract(sin(p)*43758.5453123)*2.0-1.0;
  }
  vec3 hash3(vec3 p){
    p = vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
    return fract(sin(p)*43758.5453123)*2.0-1.0;
  }
  float hash1(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
  float gnoise(vec2 x){
    vec2 p = floor(x), w = fract(x);
    vec2 u = w*w*w*(w*(w*6.0-15.0)+10.0);
    float a = dot(hash2(p+vec2(0,0)), w-vec2(0,0));
    float b = dot(hash2(p+vec2(1,0)), w-vec2(1,0));
    float c = dot(hash2(p+vec2(0,1)), w-vec2(0,1));
    float d = dot(hash2(p+vec2(1,1)), w-vec2(1,1));
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y)*0.7+0.5;
  }
  float gnoise3(vec3 x){
    vec3 p = floor(x), w = fract(x);
    vec3 u = w*w*w*(w*(w*6.0-15.0)+10.0);
    float n = 0.0;
    for(int k=0;k<2;k++)for(int j=0;j<2;j++)for(int i=0;i<2;i++){
      vec3 o = vec3(float(i),float(j),float(k));
      float wgt = mix(1.0-u.x,u.x,o.x)*mix(1.0-u.y,u.y,o.y)*mix(1.0-u.z,u.z,o.z);
      n += wgt * dot(hash3(p+o), w-o);
    }
    return n*0.8+0.5;
  }
  float fbm(vec2 p, int oct){
    float s=0.0,a=0.5,n=0.0;
    for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*gnoise(p); n+=a; p=p*2.03+11.7; a*=0.5; }
    return s/max(n,1e-4);
  }
  float fbm3(vec3 p, int oct){
    float s=0.0,a=0.5,n=0.0;
    for(int i=0;i<6;i++){ if(i>=oct) break; s+=a*gnoise3(p); n+=a; p=p*2.07+7.3; a*=0.5; }
    return s/max(n,1e-4);
  }
  float ridged3(vec3 p, int oct){
    float s=0.0,a=0.5,n=0.0;
    for(int i=0;i<6;i++){ if(i>=oct) break;
      s+=a*(1.0-abs(gnoise3(p)*2.0-1.0)); n+=a; p=p*2.11+5.7; a*=0.5; }
    return s/max(n,1e-4);
  }
  float ridged(vec2 p, int oct){
    float s=0.0,a=0.5,n=0.0;
    for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*(1.0-abs(gnoise(p)*2.0-1.0)); n+=a; p=p*2.11+5.3; a*=0.5; }
    return s/max(n,1e-4);
  }
`;
const EDGE = String.raw`    /* ---- The burning edge: one look for the loader's ring, the intro and
       every burn (the page's burn pass reads this same text). It is drawn in
       CSS pixels: xc is the distance to the front (+ ahead of it, - burnt), g
       the paper's own coordinates, so the grain, the embers and the splits
       stay put on the paper while the front passes over them, and aa is a
       device pixel in CSS px, so every hard edge is crisp to the pixel.
       wht: how wide it burns here (0.3-2.6, it swells and pinches), how hot
       (0-1, high only in a few stretches), a scale on the whole band (1;
       less on a ring still small, which must stay a rim with black inside
       it, never a glowing disc), and how alive (0.15-1: some stretches all
       but out), each wandering along the edge and over time. ---- */
    /* the loader's ring is drawn at about two-thirds size while the page
       loads, and opens out to full size over the intro's first stretch;
       the loader and the intro both draw it through this, so the hand-off
       is the same ring at the same size */
    float kbScale(float u){ return mix(0.67, 1.0, smoothstep(0.335, 0.55, u)); }
    float kbGrad(float f, float pxH, float nominal){
    #ifdef KB_NO_DERIV
      return nominal;
    #else
      return clamp(length(vec2(dFdx(f), dFdy(f)))*pxH, 0.35*nominal, 3.0*nominal);
    #endif
    }
    /* distance in pixels to where v crosses zero: a line drawn this way is
       a pixel wide wherever it runs, never a soft blotch */
    float kbLinePx(float v, float nominalPerPx){
    #ifdef KB_NO_DERIV
      return abs(v)/nominalPerPx;
    #else
      return abs(v)/max(length(vec2(dFdx(v), dFdy(v))), 0.25*nominalPerPx);
    #endif
    }
    vec4 kbEdgeWHT(vec2 e, float t){
      /* one slow field decides what each stretch is doing, so the edge never
         reads as a stroke: some arcs burn wide and hot, others narrow and
         dull, and some are all but out; it drifts slowly as it burns */
      float b = fbm(e*2.6 + vec2(t*0.24, -t*0.17) + 13.0, 3);
      float life = 0.03 + 0.97*smoothstep(0.42, 0.60, b);
      float w = (0.20 + 2.60*smoothstep(0.40, 0.66, b + 0.14*(gnoise(e*6.0 + vec2(t*0.70, 1.0)) - 0.5)))
              * (0.80 + 0.40*gnoise(e*1.6 + vec2(t*0.95, 3.0)));
      float hn = gnoise(e*4.1 + 31.0 + vec2(0.0, -t*0.08));
      float h = smoothstep(0.55, 0.80, b + 0.35*(hn - 0.5))*(0.75 + 0.25*sin(t*2.1 + hn*9.0));
      return vec4(w, h, 1.0, life);
    }
    /* hashes and a value noise with no sin in them, for the pixel-sized
       grain (fixed on the paper, so it never swims) */
    float kbHash(vec2 p){ vec3 q = fract(p.xyx*0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
    vec2 kbHash2(vec2 p){ vec3 q = fract(p.xyx*vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz)*q.zy); }
    float kbVN(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
      return mix(mix(kbHash(i), kbHash(i + vec2(1.0, 0.0)), f.x), mix(kbHash(i + vec2(0.0, 1.0)), kbHash(i + vec2(1.0, 1.0)), f.x), f.y); }
    /* The page's burn pass has its noise baked (KB_BAKED), made once at
       load: a tileable texture of fbm and ridged of three octaves, one
       gradient octave and ridged of two on a 16-cell period, so an octave stack costs a
       texture tap (the lines take it; the ring keeps its own noise, so it
       stays the loader's ring); and kbHash's own values for 2048 x 2048
       cells round the origin, which give kbVN exactly — the same grain as
       the loader's, in one tap: filtered between cell centres, at the
       smoothstep of the fraction */
    #ifdef KB_BAKED
    uniform sampler2D uKbN, uKbH;
    float kbFbmT(vec2 x){ return texture2D(uKbN, x*0.0625).r; }
    float kbRidT(vec2 x){ return texture2D(uKbN, x*0.0625).g; }
    float kbGnT(vec2 x){ return texture2D(uKbN, x*0.0625).b; }
    float kbRid2T(vec2 x){ return texture2D(uKbN, x*0.0625).a; }   /* ridged, two octaves */
    float kbV(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
      return texture2D(uKbH, (i + 1024.5 + f)*0.00048828125).r; }
    #define KBGN(x) kbGnT(x)
    #define KBFBM(x) kbFbmT(x)
    #define KBRID(x) kbRidT(x)
    /* a line's width, heat and life, as kbEdgeWHT but off the baked noise */
    vec4 kbEdgeWHTb(vec2 e, float t){
      float b = kbFbmT(e*2.6 + vec2(t*0.24, -t*0.17) + 13.0);
      float life = 0.03 + 0.97*smoothstep(0.42, 0.60, b);
      float w = (0.20 + 2.60*smoothstep(0.40, 0.66, b + 0.14*(kbGnT(e*6.0 + vec2(t*0.70, 1.0)) - 0.5)))
              * (0.80 + 0.40*kbGnT(e*1.6 + vec2(t*0.95, 3.0)));
      float hn = kbGnT(e*4.1 + 31.0 + vec2(0.0, -t*0.08));
      float h = smoothstep(0.55, 0.80, b + 0.35*(hn - 0.5))*(0.75 + 0.25*sin(t*2.1 + hn*9.0));
      return vec4(w, h, 1.0, life);
    }
    #else
    float kbV(vec2 x){ return kbVN(x); }
    #define KBGN(x) gnoise(x)
    #define KBFBM(x) fbm(x, 2)
    #define KBRID(x) ridged(x, 3)
    #endif
    /* coverage of v > 0 over w, the change in v across a device pixel,
       worked out from v's own scale rather than taken with derivatives:
       the page skips whole regions before these run, and a derivative
       taken past such a branch came back as 2x2 blocks — stair-steps and
       loose flecks along the skipped region's edge */
    float kbAA(float v, float w){ return clamp(0.5 + v/max(w, 1e-5), 0.0, 1.0); }
    /* the ember zone's width, px: 12-66 on a line, wide where it burns hot,
       narrow where it is dying, and on a small ring never under 3.5-7 px
       (as wide as it burns there): thinner, the rim read as a drawn outline,
       and even, as a drawn 'o' */
    float kbZoneW(vec4 wht){ return max((18.0 + 20.0*min(wht.x, 2.6))*wht.z*(0.55 + 0.45*wht.w), 3.5 + 3.5*smoothstep(0.3, 2.0, wht.x)); }
    /* The ember ramp every colour of the fire keeps to, before the tone
       curve: deep red, red-orange, orange, warm yellow-orange; nothing on it
       is pale or grey (the old yellow went cream at full heat and khaki when
       dimmed), and nothing is bright enough to bloom, so the flame keeps a
       hard edge on the frame ahead of it. A dim stretch goes down the ramp,
       never just darker. */
    vec3 kbRamp(float h){
      vec3 c = mix(vec3(0.11, 0.006, 0.0007), vec3(0.34, 0.032, 0.0025), smoothstep(0.00, 0.33, h));
      c = mix(c, vec3(0.90, 0.13, 0.012), smoothstep(0.33, 0.66, h));
      return mix(c, vec3(1.13, 0.30, 0.036), smoothstep(0.66, 1.00, h));
    }
    /* where the ember zone ends: its lip, W px back, torn */
    float kbLipD(float W, vec2 g){
      vec2 gr = mat2(0.80, -0.60, 0.60, 0.80)*g;
      return W*(0.78 + 0.30*kbV(gr*0.035 + 6.0)) + 1.5*(kbV(gr*0.22 + 1.0) - 0.5);
    }
    /* The front, as the footer's paper burns: a bright thread of ember that
       beads and pinches along its length (an even stroke read as neon), gold
       where it runs hot and dull red where it is nearly out, with a tight
       glow a few px round it; behind it the ember zone, packed solid and
       graded smoothly by its heat — yellow at the front, orange, deep red
       at a crisp torn lip, the hot stretches carrying the yellow further
       back (hard steps read as a poster). All of it alive: heat pulses run
       along it both ways and roll back through the zone, patches flicker,
       the beads drift. sA runs along the edge, px. */
    vec3 kbFlame(float xc, float xb, float sA, vec4 wht, vec2 g, float t, float aa){
      float hot = wht.y, life = wht.w, dist = max(-xc, 0.0);
      float W = kbZoneW(wht);
      float behind = clamp(0.5 - xc/aa, 0.0, 1.0);          /* burnt, to the pixel */
      float run = 0.5*kbV(vec2(sA*0.018 - t*1.30, 2.0)) + 0.5*kbV(vec2(sA*0.027 + t*1.70, 5.0));
      float flk = kbV(vec2(sA*0.110, t*7.0) + 3.0);
      float roll = kbV(vec2(sA*0.060, dist*0.090 - t*2.6) + 11.0);
      float heat = clamp(0.30 + 0.55*hot + 0.50*(run - 0.5) + 0.22*(flk - 0.5), 0.0, 1.0)*(0.30 + 0.70*life);
      float bead = 0.50 + 1.00*kbV(vec2(sA*0.085 - t*0.8, 7.0));
      float wc = max(0.7, (0.9 + 2.6*heat)*bead*min(1.0, wht.z*2.5));   /* the thread, ~1-5 px */
      float core = behind*exp(-dist/wc) + (1.0 - behind)*exp(-max(xc, 0.0)/0.35)*0.35;
      float glow = exp(-abs(xc + 0.5*wc)/(2.0 + 2.8*heat))*heat*min(1.0, wht.z*2.0);
      float k = dist/W;
      vec2 gr = mat2(0.80, -0.60, 0.60, 0.80)*g, ga = mat2(0.94, 0.34, -0.34, 0.94)*g;
      float gT = kbV(g*0.045 + vec2(t*0.90, -t*0.50));
      /* a few holes drawn out along the grain, drifting */
      float cl = kbV(ga*vec2(0.12, 0.42) + vec2(t*0.5, -t*0.8) + 4.0)*0.6 + kbV(gr*0.50 + 9.0)*0.4;
      float lit = kbAA(cl - (0.10 + 0.40*k*k + 0.12*(0.5 - life)), 0.45*aa)*behind;
      lit *= kbAA(kbLipD(W, g) - dist, aa);
      float tau = clamp(1.0 - k*(1.05 - 0.40*hot) + 0.22*(gT - 0.5) + 0.34*(run - 0.5) + 0.24*(roll - 0.5) + 0.12*(flk - 0.5) - 0.30*(1.0 - life), 0.0, 1.0);
      vec3 ember = mix(vec3(0.34, 0.022, 0.003), vec3(0.86, 0.20, 0.024), smoothstep(0.05, 0.42, tau));
      ember = mix(ember, vec3(1.02, 0.38, 0.055), smoothstep(0.42, 0.76, tau));
      ember = mix(ember, vec3(1.10, 0.64, 0.17), smoothstep(0.86, 1.0, tau)*(0.30 + 0.70*hot));
      float band = lit*(0.20 + 0.82*tau*tau)*(1.0 + mix(0.16, 0.50, k)*(kbV(gr*0.60) - 0.5))*(0.35 + 0.65*life);
      vec3 coreC = mix(vec3(1.40, 0.56, 0.09), vec3(1.85, 1.02, 0.30), heat);
      coreC = mix(vec3(0.38, 0.05, 0.008), coreC, smoothstep(0.06, 0.55, life));
      return coreC*core + ember*band + vec3(0.95, 0.20, 0.022)*glow*0.60;
    }
    /* the char's crust behind the lip: 3-6 px of it, hard and flaky, before
       the black: rgb its colour, a its cover */
    vec4 kbCrust(float xc, float sA, vec4 wht, vec2 g, float aa){
      float dist = max(-xc, 0.0), W = kbZoneW(wht), lipD = kbLipD(W, g);
      float cw = 3.0 + 3.0*kbV(vec2(sA*0.12, 1.7));
      float cov = kbAA(dist - lipD, aa)*kbAA(lipD + cw - dist, aa);
      float flake = kbAA(kbV(g*0.55 + 2.0) - 0.52, 0.30*aa);
      return vec4(mix(vec3(0.0030, 0.0022, 0.0016), vec3(0.022, 0.016, 0.011), flake), cov);
    }
    /* the char: near black with a fibrous grain, and, where it lies behind a
       burning line, a dim ash-grey mottling and flecks drawn out along the
       grain (ash 1); the loader's hole is quiet char with neither (ash 0) */
    vec3 kbCharCol(vec2 g, float ash){
      vec2 gr = mat2(0.80, -0.60, 0.60, 0.80)*g;
      float f = 0.55*kbV(gr*0.85 + 3.1) + 0.45*kbV(vec2(g.x*0.22 + g.y*0.10, g.y*0.95 - g.x*0.35) + 7.7);
      vec3 c = vec3(0.0085, 0.0062, 0.0048)*(0.60 + 0.80*f);   /* sumi charcoal, as the footer's */
      if (ash <= 0.0) return c;
      vec2 ga = mat2(0.94, 0.34, -0.34, 0.94)*g;
      float mott = kbV(g*0.09 + 6.0)*0.6 + kbV(gr*0.33 + 2.0)*0.4;
      float fl = kbAA(kbV(ga*vec2(0.17, 0.60) + 11.0) - 0.80, 0.30)*smoothstep(0.45, 0.70, kbV(g*0.045 + 2.0));
      return c + (vec3(0.010, 0.0085, 0.0068)*smoothstep(0.50, 0.90, mott) + vec3(0.010, 0.0085, 0.007)*fl*(0.35 + 0.85*kbV(g*0.21 + 5.0)))*ash;
    }
    /* the char burning through, never a flat slab: pores open in it as it
       ages (a: 0 at the ember zone's lip, 1 at its far edge), ragged, down
       to whatever lies beneath (no glowing rims: round the pores they
       joined into one drawn line along the edge); they open while you
       watch, as the fire moves on and in their own slow breathing. Its cover */
    float kbPores(vec2 g, float a, float t, float aa){
      vec2 gr = mat2(0.80, -0.60, 0.60, 0.80)*g;
      float n = 0.50*kbV(gr*0.060 + 21.0) + 0.32*kbV(g*0.17 + 4.0) + 0.18*kbV(gr*0.46 + 8.0);
      float thr = -0.12 + 0.95*a + 0.16*(kbV(g*0.022 + vec2(t*0.45, -t*0.30) + 2.0) - 0.5);
      float v = n - thr, w = 0.08*aa;
      return kbAA(v, w);
    }
    /* the char's far edge, a noise along the edge only (a 2-D noise cut
       loose islands of char that floated on the new frame): a line's, by
       its height, px */
    float kbEdgeNLine(float s){
      return 0.60*kbV(vec2(s*0.026, 3.1)) + 0.40*(1.0 - abs(2.0*kbV(vec2(s*0.072, 7.3)) - 1.0));
    }
    /* a ring's, round it: noise on a circle, so it closes on itself */
    float kbEdgeNRing(vec2 dir){
      return 0.60*kbV(dir*6.0 + 3.1) + 0.40*(1.0 - abs(2.0*kbV(dir*17.0 + 7.3) - 1.0));
    }
    /* how charred: from the front, through the ember zone, then a band of
       char bedW px more (as its edge noise n says), to the char's own torn
       edge, a pixel wide. xb is the distance to the broad front at its
       nominal slope, smooth and never blowing up where the field runs flat
       (the true slope, constant over each 2x2 block, stair-stepped the edge
       and opened holes in the char there), and the fine terms move the
       front off it by at most fs px: the far edge is taken from it, so no
       island of char is ever cut loose; and it always covers the embers */
    float kbBed(float xc, float xb, float fs, float n, float zoneW, float bedW, float aa, vec2 g){
      /* and a tear of a few px on it, at two scales, together gentler than
         the front's own slope, so it frays without cutting a piece loose */
      vec2 gt = mat2(0.80, -0.60, 0.60, 0.80)*g;
      float edge = zoneW + fs + bedW*(0.35 + 1.10*n) + 8.0*(kbV(gt*0.08 + 4.0) - 0.5) + 3.0*(kbV(gt*0.25 + 9.0) - 0.5);
      return clamp(0.5 - xc/aa, 0.0, 1.0)*max(kbAA(edge + min(xb, 0.0), aa), kbAA(zoneW*1.12 + 3.0 + xc, aa));
    }
    /* what still glows in the char just behind the ember zone: thin grain
       drawn out along its fibres, each thread at its own brightness,
       cooling and thinning within 20-40 px (patches read as leopard spots) */
    vec3 kbCharGlow(float xc, vec2 g, vec4 wht, float aa, float t, float specks){
      float dist = -xc, W = kbZoneW(wht);
      if (dist < 0.85*W || dist > W + 40.0) return vec3(0.0);
      vec2 ga = mat2(0.94, 0.34, -0.34, 0.94)*g;
      float fade = exp(-max(dist - 0.92*W, 0.0)/11.0)*smoothstep(0.85*W, 0.98*W, dist);
      float thread = kbV(ga*vec2(0.075, 0.75) + 17.0);
      float st = kbAA(thread - 0.78 + 0.08*fade, 0.10*aa)*smoothstep(0.45, 0.65, kbV(ga*vec2(0.03, 0.10) + 3.0));
      float br = (0.30 + 0.70*kbV(ga*vec2(0.025, 0.22) + vec2(t*0.8, -t*0.5) + 9.0))*(0.60 + 0.40*kbV(ga*vec2(0.05, 0.3) + vec2(0.0, t*4.0) + 23.0));
      return kbRamp(0.12 + 0.45*fade)*st*fade*br*(0.35 + 0.65*wht.w);
    }`;

/* ---- WebGL2 → the page's WebGL1-style GLSL ---- */
const es3 = s => s.replace(/gl_FragColor/g, 'fragColor');
const HEAD = '#version 300 es\nprecision highp float;precision highp sampler2D;\nout vec4 fragColor;\n#define texture2D texture\n';
const VS = '#version 300 es\nout vec2 vUv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';

/* ---- constants from KIBORI ---- */
const K = {
  HALF: 0.215,               /* half the burn band's width, screen heights */
  FRONT_A: -0.26, FRONT_B: 1.62,   /* front = -0.26 + 1.62*rc: in off frame, out off frame */
  SCENE_LO: 0.75,            /* live scene scale during a burn (compMat stays full res) */
  REST_MS: 150, XFADE_S: 0.30,     /* full-size scene cross-fades in after 150 ms of rest, over 0.3 s */
  REACH: 0.16,               /* live-scene scissor margin past the band: bays, haze */
  DPR_CAP: 2, DT_MAX: 1/30,
  SEED_STEP: 17.3
};
/* ---- chapters: Last Credit's three rooms (staging) ---- */
const CHAPTERS = [
  {side:'L', name:'Tickets', kicker:'01 · Ticket wall', glyph:'1UP', title:'Tickets by the yard',
   body:'Skee-ball pays out in paper ribbons. Two hundred buys a sour-cherry shot at the counter; the rest go home in your coat pocket.',
   ink:[30,16,22], soft:[92,52,48], scrim:[246,232,208], scrimA:0.62},
  {side:'R', name:'Cabinets', kicker:'02 · Cabinet row', glyph:'P2', title:'Forty cabinets, one fuse box',
   body:'Galaga, Joust and a Tempest with a temper, all on free play after ten. Mind the cable by the claw machine.',
   ink:[244,240,252], soft:[176,200,214], scrim:[6,4,12], scrimA:0.60},
  {side:'L', name:'Carpet', kicker:'03 · Back room', glyph:'HI', title:'The carpet glows back',
   body:'Blacklight on the cosmic carpet, and a high-score board that wipes at closing. Last credit at 01:45, even for the champ.',
   ink:[250,244,255], soft:[214,190,246], scrim:[8,4,18], scrimA:0.86}
];
/* ---- state ---- */
const S = {
  cur:0, trans:null, pending:null, t:0, auto:true, idle:0, dur:3.0, restAt:0, resLo:0, hold:null,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  inView:true, W:0, H:0, dpr:1
};
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', e => { S.reduced = e.matches; S.dirty = true; });

const canvas = document.getElementById('stage');
const failEl = document.getElementById('fail');
const fail = m => { failEl.textContent = m; failEl.style.display = 'grid'; };
const gl = canvas.getContext('webgl2', {antialias:false, alpha:false, depth:false, stencil:false, powerPreference:'high-performance', preserveDrawingBuffer:false});
if (!gl || !(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))){
  fail('This demo needs WebGL 2 with half-float render targets.');
  return;
}
gl.getExtension('OES_texture_float_linear');

/* ---- tiny GL host ---- */
const vao = gl.createVertexArray();
const progs = new Map();
function program(fs){
  let P = progs.get(fs); if (P) return P;
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  P = {p, loc:{}}; progs.set(fs, P); return P;
}
const frag = (body, defs = '') => es3(HEAD + defs + body);

function makeRT(w, h, kind, wrap){
  const rt = {w:0, h:0, kind, wrap, tex:gl.createTexture(), fb:gl.createFramebuffer()};
  sizeRT(rt, w, h); return rt;
}
function sizeRT(rt, w, h){
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  if (rt.w === w && rt.h === h) return;
  rt.w = w; rt.h = h;
  gl.bindTexture(gl.TEXTURE_2D, rt.tex);
  if (rt.kind === 'h')      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else if (rt.kind === 'r') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.HALF_FLOAT, null);
  else                      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const wr = rt.wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt.tex, 0);
}
/* pass(fragment, uniforms, target|null, scissor?) */
function pass(P, u, rt, sc){
  gl.useProgram(P.p);
  let unit = 0;
  for (const k in u){
    let l = P.loc[k]; if (l === undefined) l = P.loc[k] = gl.getUniformLocation(P.p, k);
    if (l === null) continue;
    const v = u[k];
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v && v.tex){ gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.tex); gl.uniform1i(l, unit++); }
    else if (v instanceof WebGLTexture){ gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(l, unit++); }
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
    else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fb : null);
  const w = rt ? rt.w : canvas.width, h = rt ? rt.h : canvas.height;
  gl.viewport(0, 0, w, h);
  if (sc){ gl.enable(gl.SCISSOR_TEST); gl.scissor(sc[0], sc[1], sc[2], sc[3]); }
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (sc) gl.disable(gl.SCISSOR_TEST);
}
/* ================================================================
 *  The scenes: Last Credit's three rooms, shader-drawn, each with its
 *  words in a texture. They are the staging; the burn does not care.
 * ================================================================ */
const SCENE_FS = frag(`
in vec2 vUv;
uniform float uTime, uAsp, uScene, uPxH, uUseText;
uniform sampler2D uText;
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
float h11(float n){ return fract(sin(n*12.9898)*43758.5453); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float sdBox(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
float sdTri(vec2 p, float r){
  const float k = 1.7320508;
  p.x = abs(p.x) - r; p.y = p.y + r/k;
  if (p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y)/2.0;
  p.x -= clamp(p.x, -2.0*r, 0.0);
  return -length(p)*sign(p.y);
}
float fill(float d, float aa){ return smoothstep(aa, -aa, d); }

/* 1 - the ticket wall: ribbons of prize tickets creeping out of the skee-ball lanes */
vec3 scene0(vec2 q, float t){
  float aa = 1.0/uPxH, rowH = 0.118, tw = 0.205;
  float y = q.y + 0.03, rid = floor(y/rowH), ry = fract(y/rowH);
  float spd = (0.010 + 0.016*h11(rid*3.7))*(mod(rid, 2.0) < 0.5 ? 1.0 : -1.0);
  float x = q.x + t*spd + h11(rid)*3.0, tx = fract(x/tw);
  float k = h11(rid*7.13 + 1.0);
  vec3 col = k < 0.34 ? vec3(0.84, 0.74, 0.55) : (k < 0.62 ? vec3(0.86, 0.46, 0.38) : (k < 0.86 ? vec3(0.88, 0.68, 0.30) : vec3(0.52, 0.66, 0.60)));
  col *= 0.86 + 0.24*fbm(q*vec2(7.0, 44.0) + rid*3.0, 3);
  vec2 lp = vec2((tx - 0.5)*tw, (ry - 0.5)*rowH);
  /* the print: an inset frame, a stamped ring, a run of serial bars */
  float ink = fill(abs(sdBox(lp, vec2(tw*0.5 - 0.013, rowH*0.5 - 0.017), 0.006)) - 0.0013, aa);
  ink = max(ink, fill(abs(length(lp - vec2(-tw*0.29, 0.0)) - 0.021) - 0.0016, aa));
  ink = max(ink, fill(length(lp - vec2(-tw*0.29, 0.0)) - 0.007, aa));
  vec2 sb = lp - vec2(tw*0.12, -0.012);
  float bar = step(0.42, h21(vec2(floor(sb.x/0.0042), rid + floor(x/tw)*3.1)));
  ink = max(ink, fill(sdBox(sb, vec2(0.050, 0.0085), 0.0), aa)*bar*step(0.0016, mod(sb.x, 0.0042)));
  ink = max(ink, fill(sdBox(lp - vec2(tw*0.12, 0.016), vec2(0.050, 0.0022), 0.0), aa));
  col = mix(col, col*vec3(0.42, 0.24, 0.22), ink*0.80);
  /* perforations between tickets, and each ribbon shading the one beneath */
  float px = (tx < 0.5 ? tx : tx - 1.0)*tw;
  float hole = fill(length(vec2(px, (fract(ry*8.0) - 0.5)*rowH/8.0)) - 0.0030, aa);
  col *= 0.66 + 0.34*smoothstep(0.0, 0.014, ry*rowH);
  vec3 wall = vec3(0.045, 0.022, 0.026);
  col = mix(col, wall, max(hole, fill(min(ry, 1.0 - ry)*rowH - 0.0022, aa)));
  /* the bar's warm light pooling and drifting */
  col *= 0.74 + 0.34*fbm(q*vec2(0.8, 1.2) + vec2(t*0.03, 0.0), 3);
  return col;
}

/* 2 - the cabinet row after ten: sprites marching, screens rolling, glow on the lacquered floor */
vec3 scene1(vec2 q, float t){
  float aa = 1.0/uPxH, cw = 0.31, floorY = -0.34;
  vec3 col = vec3(0.010, 0.007, 0.018)*(0.6 + 0.8*fbm(vec2(q.x*30.0, q.y*2.0), 3));
  float x = q.x + 0.5*uAsp + 0.07, cid = floor(x/cw), lx = (fract(x/cw) - 0.5)*cw;
  float hue = h11(cid*5.31 + 2.0);
  vec3 gc = hue < 0.33 ? vec3(0.06, 0.60, 0.78) : (hue < 0.66 ? vec3(0.82, 0.10, 0.46) : vec3(0.90, 0.46, 0.05));
  float flick = 0.90 + 0.10*(gnoise(vec2(t*9.0, cid*3.0)) - 0.5)*2.0;
  /* the cabinet: body, marquee, screen, panel */
  float body = fill(sdBox(vec2(lx, q.y - 0.02), vec2(cw*0.43, 0.36), 0.006), aa);
  float side = smoothstep(cw*0.30, cw*0.43, abs(lx));
  vec3 cab = mix(vec3(0.018, 0.012, 0.024), vec3(0.008, 0.006, 0.012), side);
  vec2 sp = vec2(lx, q.y - 0.09);
  float sdS = sdBox(sp, vec2(cw*0.33, 0.12), 0.020);
  cab += gc*exp(-max(sdS, 0.0)*26.0)*0.10*flick;
  col = mix(col, cab, body);
  /* the screen: mirrored pixel sprites marching in step, scanlines, a rolling band */
  vec2 suv = sp/vec2(cw*0.66, 0.24) + 0.5;
  vec2 sg = suv*vec2(34.0, 26.0);
  sg.x += floor(3.0*sin(t*1.1 + cid*1.7));
  sg.y -= floor(mod(t*0.5 + cid, 4.0));
  vec2 cell = floor(sg/vec2(8.0, 6.0)), ip = mod(floor(sg), vec2(8.0, 6.0));
  float bit = step(0.45, h21(vec2(abs(ip.x - 3.0), ip.y) + cell.y*7.0 + cid*13.0))*step(ip.x, 6.0)*step(ip.y, 4.0)
            *step(1.0, cell.y)*step(cell.y, 2.0)*step(0.5, cell.x)*step(cell.x, 3.5);
  float ship = fill(sdBox(suv - vec2(0.5 + 0.25*sin(t*0.7 + cid), 0.12), vec2(0.04, 0.025), 0.0), 0.004);
  vec3 scr = gc*0.07 + gc*1.05*bit + vec3(0.9, 0.85, 0.7)*ship*0.8;
  scr *= 0.82 + 0.18*sin(q.y*1050.0);
  scr += gc*0.18*exp(-pow((suv.y - fract(-t*0.22 + hue))*7.0, 2.0));
  scr *= (1.0 - 0.55*smoothstep(-0.03, 0.0, sdS))*flick;
  col = mix(col, scr, fill(sdS, aa));
  /* the marquee lit from behind, the panel with its two buttons */
  vec2 mp = vec2(lx, q.y - 0.31);
  float sdM = sdBox(mp, vec2(cw*0.38, 0.034), 0.004);
  vec3 marq = mix(gc, vec3(0.95, 0.80, 0.55), 0.35)*(0.55 + 0.25*step(0.5, fract(mp.x*26.0 + t*0.6)))*flick;
  col = mix(col, marq, fill(sdM, aa));
  vec2 pp = vec2(lx, q.y + 0.10);
  col = mix(col, vec3(0.03, 0.025, 0.04), fill(sdBox(pp, vec2(cw*0.40, 0.035), 0.004), aa));
  col = mix(col, vec3(0.80, 0.08, 0.06), fill(length(pp - vec2(cw*0.10, 0.0)) - 0.011, aa));
  col = mix(col, gc*0.9, fill(length(pp - vec2(cw*0.20, 0.0)) - 0.011, aa));
  col = mix(col, vec3(0.06), fill(sdBox(pp - vec2(-cw*0.18, 0.012), vec2(0.004, 0.022), 0.003), aa));
  /* the floor: dark lacquer under them, each screen's glow smeared into it */
  if (q.y < floorY){
    float dd = floorY - q.y;
    vec3 fl = vec3(0.012, 0.009, 0.016)*(0.7 + 0.6*fbm(vec2(q.x*4.0, dd*30.0), 2));
    fl += gc*exp(-abs(lx)/(cw*0.22))*exp(-dd*7.0)*0.16*flick;
    col = mix(col, fl, fill(q.y - floorY, aa));
  }
  return col;
}

/* 3 - the back room: cosmic carpet under blacklight */
vec3 scene2(vec2 q, float t){
  float aa = 1.0/uPxH, cs = 0.17;
  vec3 col = vec3(0.012, 0.006, 0.032)*(0.55 + 0.9*fbm(q*140.0, 2));
  float sweep = exp(-pow((q.x*0.7 - q.y*0.4 - (mod(t*0.09, 2.6) - 1.3))*1.5, 2.0));
  for (int L = 0; L < 2; L++){
    vec2 o = float(L)*vec2(0.5, 0.37)*cs;
    vec2 cell = floor((q + o)/cs), lp = (fract((q + o)/cs) - 0.5)*cs;
    float h = h21(cell + float(L)*17.0), h2 = h21(cell*1.7 + 3.0 + float(L)*5.0);
    if (h2 < 0.30) continue;
    lp -= (vec2(h2, fract(h*31.0)) - 0.5)*cs*0.35;
    float ang = h*6.2832 + 0.15*sin(t*0.4 + h*9.0);
    vec2 p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang))*lp;
    float typ = fract(h*7.0), d;
    if (typ < 0.26) d = abs(length(p) - 0.028) - 0.0042;
    else if (typ < 0.52) d = abs(sdTri(p, 0.030)) - 0.0040;
    else if (typ < 0.80){
      float c = cos(p.x*95.0);
      d = max(abs(p.y - 0.010*sin(p.x*95.0))/sqrt(1.0 + 0.9*c*c) - 0.0040, abs(p.x) - 0.046);
    } else d = length(p) - 0.0105;
    float pc = fract(h*13.0);
    vec3 nc = pc < 0.25 ? vec3(0.95, 0.08, 0.48) : (pc < 0.5 ? vec3(0.06, 0.78, 0.86) : (pc < 0.75 ? vec3(0.70, 0.88, 0.04) : vec3(0.46, 0.14, 0.98)));
    float pulse = (0.72 + 0.28*sin(t*1.3 + h*20.0))*(0.70 + 0.45*sweep);
    col += nc*exp(-max(d, 0.0)*80.0)*0.09*pulse;
    col = mix(col, nc*pulse, fill(d, aa));
  }
  return col*(0.80 + 0.30*sweep);
}
void main(){
  vec2 q = (vUv - 0.5)*vec2(uAsp, 1.0);
  vec3 c = uScene < 0.5 ? scene0(q, uTime) : (uScene < 1.5 ? scene1(q, uTime) : scene2(q, uTime));
  /* the cabinets step back behind the words (right on wide screens, lower half on phones) */
  if (uScene > 0.5 && uScene < 1.5) c *= 1.0 - 0.72*(uAsp > 1.0 ? smoothstep(0.40, 0.58, vUv.x) : smoothstep(0.62, 0.42, vUv.y));
  if (uUseText > 0.5){ vec4 tx = texture2D(uText, vUv); c = mix(c, lin(tx.rgb), tx.a); }   /* only the frozen frame carries its words; the live side gets them at full size in the burn pass */
  gl_FragColor = vec4(min(c, vec3(1.1)), 1.0);   /* stays under the bloom threshold, so a rest frame carries none */
}`, NOISE);

/* ================================================================
 *  The burn pass — KIBORI's compMat, its line branch (horiz), with the
 *  page's own text between the markers.
 * ================================================================ */
const COMP_FS = frag(`
in vec2 vUv;
uniform sampler2D uTo, uFrom, uToText;
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
uniform float uAspect, uTime, uSeed, uFront, uChar, uDir, uSame, uClip, uPxH, uPxS, uMode, uFade;
vec3 liveAt(vec2 uv){ vec4 tx = texture2D(uToText, uv); return mix(texture2D(uTo, uv).rgb, lin(tx.rgb), tx.a); }
vec3 fromAt(vec2 uv){ return texture2D(uFrom, uv).rgb; }
void main(){
  vec3 to = liveAt(vUv);
  if (uMode > 1.5){ gl_FragColor = vec4(mix(fromAt(vUv), to, uFade), 1.0); return; }   /* reduced motion: a plain cross-fade */
  const bool horiz = true;
  const float maxR = 1.0, Tr = 0.0;   /* the ring's; unused by the line */
  const float HALF = ${K.HALF};
  float sc = 1.0, pxR = uPxH*sc;
  if (uFront < -0.55){ gl_FragColor = vec4(fromAt(vUv), 1.0); return; }
  if (uFront >  1.55){ gl_FragColor = vec4(to, 1.0); return; }
  vec2  p  = (vUv - vec2(0.5)) * vec2(uAspect, 1.0);
  float hx = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
  if (hx - uFront > HALF + 0.15){ gl_FragColor = vec4(fromAt(vUv), 1.0); return; }
  if (uFront - hx > 0.25 - HALF){ gl_FragColor = vec4(to, 1.0); return; }
      float field, fieldS, xBpx = 0.0;
      vec4 rb = vec4(0.0);
      /* each burn its own silhouette: how many broad bays run up the frame,
         how deep they are and how far it leans, from its seed */
      vec2 sv = fract(vec2(0.6180, 0.7549)*uSeed + vec2(0.13, 0.41));
      vec2 qs = vec2(0.9, mix(2.0, 3.6, sv.x)), q = p*qs;
      float gradL = 0.0;
      if (horiz){
        /* its broad shape, and its slope from the same a few px off: the
           baked noise's slope is constant across each of its texels, and
           taken per pixel it striped the band across the line */
        vec2 dq = qs*4.0*uPxS/uPxH;
        float fS0 = (kbFbmT(q*1.10 + uSeed) - 0.50)*mix(0.055, 0.115, sv.y)
                  + (kbFbmT(mat2(0.96, 0.28, -0.28, 0.96)*q*2.60 + uSeed*3.1 + 21.0) - 0.50)*mix(0.050, 0.030, sv.y);
        float fSx = (kbFbmT((q + vec2(dq.x, 0.0))*1.10 + uSeed) - 0.50)*mix(0.055, 0.115, sv.y)
                  + (kbFbmT(mat2(0.96, 0.28, -0.28, 0.96)*(q + vec2(dq.x, 0.0))*2.60 + uSeed*3.1 + 21.0) - 0.50)*mix(0.050, 0.030, sv.y);
        float fSy = (kbFbmT((q + vec2(0.0, dq.y))*1.10 + uSeed) - 0.50)*mix(0.055, 0.115, sv.y)
                  + (kbFbmT(mat2(0.96, 0.28, -0.28, 0.96)*(q + vec2(0.0, dq.y))*2.60 + uSeed*3.1 + 21.0) - 0.50)*mix(0.050, 0.030, sv.y);
        float hStep = 4.0*uPxS/uPxH;
        gradL = length(vec2((uDir > 0.0 ? 1.0 : -1.0)/uAspect + (fSx - fS0)/hStep, (sv.x - 0.5)*0.07 + (fSy - fS0)/hStep));
        fieldS = hx + fS0 + p.y*(sv.x - 0.5)*0.07;
        field  = fieldS;
      }
      float grad = horiz ? clamp(gradL, 0.35/uAspect, 3.0/uAspect) : kbGrad(fieldS, pxR, 1.0/maxR);
      float T = horiz ? (uFront + HALF) : Tr;
      if (horiz){
        /* the same for a line: its fine notches move it at most 0.014, so
           more than 62 px ahead (past its scorch) only the frame being left,
           and more than 125 px behind only the live frame */
        float xB = (fieldS - T)/grad*pxR/uPxS, slack = 0.026/grad*pxR/uPxS;
        xBpx = (fieldS - T)*uAspect*pxR/uPxS;   /* at its nominal slope (see kbBed) */
        if (xB - slack > 62.0){ gl_FragColor = vec4(fromAt(vUv), 1.0); return; }
        if (xB < -125.0 && xBpx < -125.0){   /* (its char's edge is taken from the broad front) */
          gl_FragColor = vec4(to, 1.0); return;
        }
        /* (each on its own turn of the baked tile, so none repeats up the line) */
        float crys  = kbRidT(mat2(0.87, 0.49, -0.49, 0.87)*q* 6.40 + uSeed*7.7 +  5.0);
        float lace  = kbRid2T(mat2(0.62, -0.78, 0.78, 0.62)*q*15.00 + uSeed*2.3 + 13.0);
        field = fieldS + (crys-0.62)*0.014 + (lace-0.62)*0.006 + (kbRid2T(mat2(0.39, 0.92, -0.92, 0.39)*q*34.0 + uSeed + 3.0) - 0.62)*0.0025;
        /* and licking: fine tongues that climb the line and flicker, so the
           front is never still (at most 0.012 more, in the slack above) */
        field += (kbGnT(vec2(q.x*4.0 + uSeed, q.y*6.0 - uTime*1.1)) - 0.5)*0.022
               + (kbGnT(vec2(q.x*11.0 + 3.0, q.y*16.0 - uTime*2.8) + uSeed) - 0.5)*0.010;
      }
      float s = field - T;                       /* <0 = the fire has reached it */
      float d = s/grad;
      /* and in CSS px, the edge's own measure; aaC a device pixel */
      float cpx = pxR/uPxS, aaC = 1.0/uPxS, xc = d*cpx;
      vec2 g = p*cpx;
      /* the new frame from the front back, cut to the pixel: a ramp as wide
         as the field's own slope showed it through the old one ahead of the
         flame, a see-through copy of the edge */
      float reveal = clamp(0.5 - xc/aaC, 0.0, 1.0);

      /* a little heat shimmer at the flame and no more — about a pixel: more
         bent the lattice and the shoji bars standing beside the line */
      vec2 ruv = vUv;
      float heat = exp(-abs(xc)/18.0);
      if (heat > 0.03){
        vec2 fl = vec2(g.x*0.070 + uSeed, g.y*0.055 - uTime*2.2);
        ruv = clamp(vUv + (vec2(kbGnT(fl), kbGnT(fl + 7.3)) - 0.5)*heat*(1.8/uPxH), vec2(0.001), vec2(0.999));
        to = liveAt(ruv);
      }
      vec3 col;
      if (horiz){
        /* Ahead of the line, the station being left, frozen; behind it, the
           live one ahead — the line reveals where you are going instead of
           the floor between. */
        col = mix(fromAt(ruv), to, reveal);
        /* the line that takes the lockup off burns the text, not the room:
           it dies out at the text column's edge (uClip), short of the panel */
        float lineK = uChar*(1.0 - smoothstep(uClip - 0.018, uClip, hx));
        /* its swells, hot and dying stretches run along it and drift over
           time, the same across its width: taken off its height alone, so
           the band's edges never cut a piece loose */
        vec2 e = vec2(uSeed*0.37 + 3.0, p.y*1.9 + uSeed);
        vec4 wh = kbEdgeWHTb(e, uTime);
        wh.x = mix(wh.x, max(wh.x, 1.0), uSame);   /* the lockup's line burns as broad as a chapter's */
        vec2 gp = g + uSeed*vec2(31.0, 17.0);             /* a fresh patch of paper per burn */
        /* ahead of the flame the frozen frame scorches: 20-40 px of it, in
           three tones — a faint tan, a brown, a dark brown against the flame
           — each reaching out as far as the grain and a coarser noise let
           it, so every boundary is broken and none copies the flame's
           outline; the outermost is barely a tint. One edge: the flame's */
        float tw = 20.0 + 20.0*kbV(vec2(gp.y*0.034, 5.0));
        float sgr = kbV(mat2(0.94, 0.34, -0.34, 0.94)*gp*vec2(0.16, 0.36) + 5.0)*0.5 + kbV(mat2(0.80, -0.60, 0.60, 0.80)*gp*0.45)*0.5;
        float brk = kbV(gp*0.06 + 8.0)*0.6 + kbV(mat2(0.28, 0.96, -0.96, 0.28)*gp*0.19 + 1.0)*0.4;
        /* one continuous darkening from the flame out, over a reach that
           the noise varies: no steps, so no drawn outlines */
        float tk = clamp(1.0 - xc/(tw*(0.65 + 0.70*brk)), 0.0, 1.0);   /* 1 at the flame, 0 at its reach */
        float scA = tk*tk*(0.70 + 0.30*sgr);
        col = mix(col, col*mix(vec3(0.80, 0.62, 0.42), vec3(0.20, 0.10, 0.045), tk), step(0.0, xc)*scA*lineK);
        /* behind it the ember zone, 25-45 px, and a band of char 25-40 px
           more, near black and grained, crumbling off the live scene along a
           ragged edge crisp to the pixel */
        float bed = kbBed(xc, xBpx, 12.0, kbEdgeNLine(gp.y), kbZoneW(wh), 26.0, aaC, gp);
        float po = kbPores(gp, clamp((-xc - 1.05*kbZoneW(wh))/40.0, 0.0, 1.0), uTime, aaC);
        col = mix(col, kbCharCol(gp, 1.0), bed*po*lineK);
        vec4 crust = kbCrust(xc, gp.y, wh, gp, aaC);
        col = mix(col, crust.rgb, crust.a*lineK);
        col += (kbFlame(xc, xBpx, gp.y, wh, gp, uTime, aaC) + kbCharGlow(xc, gp, wh, aaC, uTime, 0.0))*lineK;
        /* (no smoke: it never read as more than grey lines at this scale)*/
      }
      gl_FragColor = vec4(col, 1.0);
}`, NOISE + '#define KB_BAKED\n' + EDGE);

/* ---- baking: made once, exactly as the page does ---- */
const BAKE_HASH = frag(`in vec2 vUv;
void main(){ gl_FragColor = vec4(kbHash(floor(vUv*2048.0) - 1024.0), 0.0, 0.0, 1.0); }`, NOISE + EDGE);
const BAKE_NOISE = frag(`in vec2 vUv;
float gnP(vec2 x, float per, vec2 off){
  vec2 i = floor(x), w = fract(x), u = w*w*w*(w*(w*6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i, per) + off, i1 = mod(i + 1.0, per) + off;
  float a = dot(hash2(i0), w), b = dot(hash2(vec2(i1.x, i0.y)), w - vec2(1.0, 0.0));
  float c = dot(hash2(vec2(i0.x, i1.y)), w - vec2(0.0, 1.0)), d = dot(hash2(i1), w - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y)*0.7 + 0.5;
}
float fbmP(vec2 x, float per, vec2 off){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 3; i++){ s += a*gnP(x, per, off + float(i)*17.0); n += a; x *= 2.0; per *= 2.0; a *= 0.5; }
  return s/n;
}
float ridP(vec2 x, float per, vec2 off, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 3; i++){ if (i >= oct) break; s += a*(1.0 - abs(gnP(x, per, off + float(i)*23.0)*2.0 - 1.0)); n += a; x *= 2.0; per *= 2.0; a *= 0.5; }
  return s/n;
}
void main(){
  vec2 x = vUv*16.0;
  gl_FragColor = vec4(fbmP(x, 16.0, vec2(0.0)), ridP(x, 16.0, vec2(301.0, 17.0), 3), gnP(x, 16.0, vec2(57.0, 211.0)), ridP(x, 16.0, vec2(113.0, 419.0), 2));
}`, NOISE);

/* ---- bloom (the page's own: bright pass, half-res blur, quarter-res blur) ---- */
const BRIGHT_FS = frag(`in vec2 vUv; uniform sampler2D uTex; uniform float uThresh;
void main(){
  vec3 c = texture2D(uTex,vUv).rgb;
  float l = max(max(c.r,c.g),c.b);
  float k = max(0.0, l-uThresh)/max(l,1e-4);
  gl_FragColor = vec4(c*k*k*0.25, 1.0);   /* 0..4 packed into 8 bits */
}`);
const BLUR_FS = frag(`in vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 s = texture2D(uTex,vUv).rgb*0.2270270;
  s += (texture2D(uTex,vUv+uDir*1.3846153).rgb + texture2D(uTex,vUv-uDir*1.3846153).rgb)*0.3162162;
  s += (texture2D(uTex,vUv+uDir*3.2307692).rgb + texture2D(uTex,vUv-uDir*3.2307692).rgb)*0.0702702;
  gl_FragColor = vec4(s,1.0);
}`);
const DOWN_FS = frag(`in vec2 vUv; uniform sampler2D uTex;
void main(){ gl_FragColor = vec4(texture2D(uTex,vUv).rgb,1.0); }`);
const MIX_FS = frag(`in vec2 vUv; uniform sampler2D uLo, uHi, uText; uniform float uK;
void main(){
  vec3 c = mix(texture2D(uLo, vUv).rgb, texture2D(uHi, vUv).rgb, uK);
  vec4 tx = texture2D(uText, vUv);
  gl_FragColor = vec4(min(mix(c, pow(tx.rgb, vec3(2.2)), tx.a), vec3(1.1)), 1.0);   /* the words, full size, over whichever scene is showing */
}`);
/* the page's final pass: bloom in, vignette, ACES, sRGB, a hair of grain */
const FINAL_FS = frag(`in vec2 vUv;
uniform sampler2D uTex, uB1, uB2; uniform float uTime, uBloom; uniform vec2 uRes;
vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
vec3 lin2srgb(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(1e-5)),vec3(1.0/2.4))-0.055, step(0.0031308,c)); }
void main(){
  vec2 d = vUv - 0.5;
  vec3 col = texture2D(uTex, vUv).rgb;
  col += texture2D(uB1, vUv).rgb * 0.26 * 4.0 * uBloom;
  col += texture2D(uB2, vUv).rgb * 0.34 * 4.0 * uBloom;
  float v = 1.0 - smoothstep(0.46, 1.20, length(d*vec2(1.02,1.0))*1.24);
  col *= 0.42 + 0.58*v;
  col = lin2srgb(aces(max(col, 0.0)));
  float g = hash1(vUv*uRes + fract(uTime)*137.0);
  col += (g-0.5)*0.003;
  gl_FragColor = vec4(col, 1.0);
}`, NOISE);

/* ---- programs ---- */
let P = {};
try {
  P.scene = program(SCENE_FS); P.comp = program(COMP_FS);
  P.hash = program(BAKE_HASH); P.noise = program(BAKE_NOISE);
  P.bright = program(BRIGHT_FS); P.blur = program(BLUR_FS); P.down = program(DOWN_FS);
  P.mix = program(MIX_FS); P.final = program(FINAL_FS);
} catch (e){ fail('Shader error: ' + e.message.slice(0, 300)); return; }

/* baked once at start: fbm/ridged/gradient in one tileable 1024^2 texture, kbHash's lattice in a 2048^2 table */
const noiseRT = makeRT(1024, 1024, 'h', true), hashRT = makeRT(2048, 2048, 'r', true);
pass(P.noise, {}, noiseRT); pass(P.hash, {}, hashRT);

/* ---- targets, sized from the viewport ---- */
let rtLive, rtLo, rtFrom, rtComp, rtMix, rtG1, rtG2, rtG3, rtG4;
const texts = CHAPTERS.map(() => ({tex:gl.createTexture()}));

function fontsReady(){
  return Promise.all([
    document.fonts.load('800 96px "Bricolage Grotesque"'), document.fonts.load('400 17px "Bricolage Grotesque"'),
    document.fonts.load('12px "DM Mono"'), document.fonts.load('20px "Silkscreen"', '1UPHI')
  ]).catch(() => {});
}
function drawText(i, W, H, dpr){
  const c = document.createElement('canvas'); c.width = Math.round(W*dpr); c.height = Math.round(H*dpr);
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const ch = CHAPTERS[i], rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`, rgba = (a, o) => `rgba(${a[0]},${a[1]},${a[2]},${o})`;
  const narrow = W < 700, pad = narrow ? 24 : Math.max(48, W*0.07);
  const bw = narrow ? W - pad*2 : Math.min(600, W*0.43);
  const bx = ch.side === 'L' ? pad : W - pad - bw;
  const tSize = narrow ? 44 : Math.round(Math.min(96, Math.max(56, W*0.062)));
  /* a soft scrim on the words' side, so they read over any room (part of the scene, so it burns with it) */
  const reach = pad + bw + W*0.16, hold = (pad + bw*0.8)/reach;
  const sg = narrow ? x.createLinearGradient(0, H, 0, H*0.28)
    : (ch.side === 'L' ? x.createLinearGradient(0, 0, reach, 0) : x.createLinearGradient(W, 0, W - reach, 0));
  sg.addColorStop(0, rgba(ch.scrim, ch.scrimA)); sg.addColorStop(narrow ? 0.5 : hold, rgba(ch.scrim, ch.scrimA*0.88)); sg.addColorStop(1, rgba(ch.scrim, 0));
  x.fillStyle = sg; x.fillRect(0, 0, W, H);
  const wrap = (s, font, max, ls = '0px') => { x.font = font; x.letterSpacing = ls; const out = []; let line = '';
    for (const w of s.split(' ')){ const t = line ? line + ' ' + w : w; if (x.measureText(t).width > max && line){ out.push(line); line = w; } else line = t; }
    if (line) out.push(line); x.letterSpacing = '0px'; return out; };
  const tFont = `800 ${tSize}px "Bricolage Grotesque", system-ui, sans-serif`, tLS = `${(-tSize*0.035).toFixed(1)}px`;
  const bSize = narrow ? 15 : 17, bFont = `400 ${bSize}px "Bricolage Grotesque", system-ui, sans-serif`;
  const tl = wrap(ch.title, tFont, bw, tLS), bl = wrap(ch.body, bFont, Math.min(bw, 430));
  const tLH = tSize*0.98, bLH = bSize*1.5;
  const total = 44 + tl.length*tLH + 22 + bl.length*bLH;
  let y = H*(narrow ? 0.62 : 0.54) - total/2;
  x.textBaseline = 'alphabetic'; x.fillStyle = rgb(ch.soft);
  x.font = `12px "DM Mono", ui-monospace, monospace`; x.letterSpacing = '0.22em';
  x.fillText(ch.kicker.toUpperCase(), bx, y + 12);
  x.letterSpacing = '0.06em';
  x.font = `16px "Silkscreen", ui-monospace, monospace`; x.textAlign = 'right'; x.fillText(ch.glyph, bx + bw, y + 13);
  x.textAlign = 'left'; x.letterSpacing = '0px';
  y += 44 + tSize*0.84;
  x.fillStyle = rgb(ch.ink); x.font = tFont; x.letterSpacing = tLS;
  for (const l of tl){ x.fillText(l, bx, y); y += tLH; }
  x.letterSpacing = '0px';
  y += 22 - tSize*0.84 + bLH*0.75;
  x.fillStyle = rgb(ch.soft); x.font = bFont;
  for (const l of bl){ x.fillText(l, bx, y); y += bLH; }
  gl.bindTexture(gl.TEXTURE_2D, texts[i].tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
function resize(){
  const W = Math.floor(canvas.clientWidth), H = Math.floor(canvas.clientHeight);
  if (W < 2 || H < 2) return;                                   /* a zero viewport builds nothing */
  const dpr = Math.min(window.devicePixelRatio || 1, K.DPR_CAP);
  const pw = Math.round(W*dpr), ph = Math.round(H*dpr);
  if (W === S.W && H === S.H && dpr === S.dpr && rtLive) return;
  S.W = W; S.H = H; S.dpr = dpr;
  canvas.width = pw; canvas.height = ph;
  const go = (rt, w, h, k, wr) => rt ? (sizeRT(rt, w, h), rt) : makeRT(w, h, k, wr);
  rtLive = go(rtLive, pw, ph, 'h'); rtFrom = go(rtFrom, pw, ph, 'h'); rtComp = go(rtComp, pw, ph, 'h'); rtMix = go(rtMix, pw, ph, 'h');
  rtLo = go(rtLo, pw*K.SCENE_LO, ph*K.SCENE_LO, 'h');
  rtG1 = go(rtG1, pw >> 1, ph >> 1, 'b'); rtG2 = go(rtG2, pw >> 1, ph >> 1, 'b');
  rtG3 = go(rtG3, pw >> 2, ph >> 2, 'b'); rtG4 = go(rtG4, pw >> 2, ph >> 2, 'b');
  CHAPTERS.forEach((_, i) => drawText(i, W, H, dpr));
  S.dirty = true;
}
new ResizeObserver(resize).observe(canvas);
new IntersectionObserver(es => { S.inView = es[0].isIntersecting; }).observe(canvas);

/* ---- one scene into a target ---- */
function drawScene(i, rt, t, sc, withText){
  pass(P.scene, {uTime:t, uAsp:S.W/S.H, uScene:i, uPxH:rt.h, uText:texts[i], uUseText:withText ? 1 : 0}, rt, sc);
}
const stillT = 6.0;             /* the reduced-motion still: a fixed instant, never animating */

/* ---- transitions ---- */
const sideOf = i => CHAPTERS[i].side === 'R' ? -1 : 1;
function go(to, opts = {}){
  to = ((to % CHAPTERS.length) + CHAPTERS.length) % CHAPTERS.length;
  if (S.trans){ S.pending = to; return; }                      /* a press mid-burn queues; the last one wins */
  if (to === S.cur) return;
  const from = S.cur;
  S.trans = {from, to, f:0, dir:sideOf(to), seed:(to + 1)*K.SEED_STEP, frozenAt:S.t, hold:opts.hold ?? null, first:true};
  document.getElementById('live').textContent = `Room ${to + 1} of ${CHAPTERS.length}, ${CHAPTERS[to].name}`;
  syncUI(to);
}
function finish(){
  S.cur = S.trans.to; S.trans = null; S.restAt = performance.now(); S.idle = 0;
  const n = S.pending; S.pending = null;
  if (n !== null && n !== S.cur) go(n);
  syncUI(S.trans ? S.trans.to : S.cur);
}
function syncUI(active){
  document.querySelectorAll('.dots button').forEach(b => b.setAttribute('aria-current', String(+b.dataset.i === active)));
}
document.querySelector('.next').onclick = () => go((S.trans ? (S.pending ?? S.trans.to) : S.cur) + 1);
document.querySelector('.prev').onclick = () => go((S.trans ? (S.pending ?? S.trans.to) : S.cur) - 1);
document.querySelectorAll('.dots button').forEach(b => b.onclick = () => go(+b.dataset.i));
const durEl = document.getElementById('dur'), durOut = document.getElementById('durOut');
durEl.oninput = () => { S.dur = +durEl.value; durOut.textContent = S.dur.toFixed(1) + ' s'; };
addEventListener('pointerdown', () => { S.auto = false; }, true);
addEventListener('keydown', e => {
  S.auto = false;
  if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
  const base = S.trans ? (S.pending ?? S.trans.to) : S.cur;
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && e.target.tagName !== 'BUTTON')){ e.preventDefault(); go(base + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp'){ e.preventDefault(); go(base - 1); }
  else if (/^[1-3]$/.test(e.key)) go(+e.key - 1);
});

/* ---- frame ---- */
let last = 0;
document.addEventListener('visibilitychange', () => { last = 0; });    /* resume without integrating the pause */
function frame(now){
  requestAnimationFrame(frame);
  if (!rtLive || document.hidden || !S.inView){ last = 0; return; }
  const dt = last ? Math.min(K.DT_MAX, (now - last)/1000) : 0; last = now;
  const reduced = S.reduced;
  if (!reduced) S.t += dt;
  const tS = reduced ? stillT : S.t;
  /* the first screen shows the burn without a click: it plays itself until the first touch */
  if (S.auto && !S.trans && !reduced){ S.idle += dt; if (S.idle > (S.cur === 0 && S.t < 3 ? 1.4 : 2.6)){ S.idle = 0; go(S.cur + 1); } }
  const T = S.trans;
  let front = 0, fade = 0;
  if (T){
    if (reduced){ T.f = Math.min(1, T.f + dt/0.35); fade = T.f*T.f*(3 - 2*T.f); }
    else if (T.hold !== null) T.f = T.hold;
    else T.f = Math.min(1, T.f + dt/S.dur);
    const raw = Math.min(1, Math.max(0, (T.f - 0.01)/0.97));          /* the line's own clock */
    front = K.FRONT_A + K.FRONT_B*raw;                                /* linear: it travels, it does not rush the middle */
    if (T.first){ drawScene(T.from, rtFrom, reduced ? stillT : T.frozenAt, null, true); T.first = false; }   /* the frame being left, frozen */
  }
  if (!T && reduced && !S.dirty) return;          /* the reduced-motion still redraws only when something changed */

  const idx = T ? T.to : S.cur;
  const trans = !!T && !reduced;
  if (trans){ S.resLo = 1; S.restAt = now; }
  else if (S.resLo > 0 && now - S.restAt > K.REST_MS) S.resLo = Math.max(0, S.resLo - dt/K.XFADE_S);
  const lo = S.resLo > 0 && !reduced, xf = lo && S.resLo < 1;
  const live = lo ? rtLo : rtLive;
  /* the live scene is drawn only where it is seen: behind the line, plus its reach */
  let sc = null;
  if (trans){
    const reach = Math.min(1, Math.max(0, front + K.HALF + K.REACH));
    const x0 = T.dir > 0 ? 0 : Math.floor((1 - reach)*live.w), x1 = T.dir > 0 ? Math.ceil(reach*live.w) : live.w;
    sc = [x0, 0, Math.max(1, x1 - x0), live.h];
  }
  drawScene(idx, live, tS, sc);
  if (xf) drawScene(idx, rtLive, tS);
  let src = live;
  if (!T){    /* at rest: the scene (cross-fading up from 0.75 scale if it just was) plus its words at full size */
    const k = lo ? (1 - S.resLo)*(1 - S.resLo)*(3 - 2*(1 - S.resLo)) : 1;
    pass(P.mix, {uLo:lo ? rtLo : rtLive, uHi:rtLive, uK:k, uText:texts[idx]}, rtMix); src = rtMix;
  }
  let bloom = 0;
  if (T){
    pass(P.comp, {uTo:live, uToText:texts[idx], uKbN:noiseRT, uKbH:hashRT, uFrom:rtFrom, uMode:reduced ? 2 : 1, uFade:fade,
      uAspect:S.W/S.H, uTime:tS, uSeed:T.dir === undefined ? 0 : T.seed, uFront:front, uDir:T.dir,
      uChar:1, uSame:0, uClip:9, uPxH:rtComp.h, uPxS:rtComp.h/S.H}, rtComp);
    src = rtComp;
    if (!reduced){
      bloom = 1;
      pass(P.bright, {uTex:rtComp, uThresh:1.15}, rtG1);
      pass(P.blur, {uTex:rtG1, uDir:[1/rtG1.w, 0]}, rtG2);
      pass(P.blur, {uTex:rtG2, uDir:[0, 1/rtG1.h]}, rtG1);
      pass(P.down, {uTex:rtG1}, rtG3);
      pass(P.blur, {uTex:rtG3, uDir:[2.1/rtG3.w, 0]}, rtG4);
      pass(P.blur, {uTex:rtG4, uDir:[0, 2.1/rtG3.h]}, rtG3);
    }
  }
  pass(P.final, {uTex:src, uB1:rtG1, uB2:rtG3, uTime:tS, uBloom:bloom, uRes:[canvas.width, canvas.height]}, null);
  S.dirty = false;
  if (T && T.f >= 1 && T.hold === null) finish();
}

/* test hooks: __cinder.hold(from,to,f) parks a held burn at progress f; release() lets it run */
window.__cinder = {
  state: () => ({cur:S.cur, trans:S.trans && {from:S.trans.from, to:S.trans.to, f:S.trans.f}, pending:S.pending, resLo:S.resLo, t:S.t, w:canvas.width, h:canvas.height}),
  go,
  hold(from, to, f){ S.auto = false; S.trans = null; S.cur = from; S.pending = null; go(to, {hold:f}); },
  setHold(f){ if (S.trans) S.trans.hold = f; },
  release(){ if (S.trans) S.trans.hold = null; }
};

fontsReady().then(() => { resize(); CHAPTERS.forEach((_, i) => drawText(i, S.W, S.H, S.dpr)); S.dirty = true;
  syncUI(0); requestAnimationFrame(frame);
  const q = new URLSearchParams(location.search);
  if (q.has('hold')) window.__cinder.hold(+(q.get('from') || 0), +(q.get('to') || 1), +q.get('hold'));
  else if (q.has('shot') && !S.reduced) window.__cinder.hold(0, 1, 0.37);   /* capture: the burn parked mid-frame, still flickering */
});
}
main();
