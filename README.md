# mengto — web design skills, shown by example

A local gallery of the 91 web-design agent skills from
[Meng To's **Skills** collection](https://github.com/MengTo/skills/tree/main/agent-skills/web-design).
Each skill gets one example page, built by an AI coding agent that loaded the skill and followed it.
The home page lists every skill as a card: a preview of its example page (it plays live on hover),
the title, the skill command and the skill's description.

> Every page here is a design study. The brands, products, people, prices and quotes on them
> are fictional and exist only to show the skill. See [Credits](#credits).

## Run it

```bash
pnpm install
pnpm exec playwright install chromium   # only needed for previews / self-checks
pnpm dev                                # http://localhost:4321
```

| Command                               | What it does                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`                            | Astro dev server                                                               |
| `pnpm build && pnpm preview`          | static build in `dist/`                                                        |
| `pnpm capture [names…]`               | re-captures the card previews in `public/previews/` (needs the dev server up)  |
| `pnpm shot <name> [--scroll]`         | desktop and mobile screenshots of one page in `.shots/`, plus console errors   |
| `node scripts/gen-manifest.mjs`       | rebuilds `src/data/skills.json` from the skill sources in `.skills/`           |

The skill sources are not in this repository. To regenerate the manifest, unzip the skills from
[MengTo/skills](https://github.com/MengTo/skills/tree/main/agent-skills/web-design) into `.skills/<name>/`.

## How it is put together

- **Stack:** Astro 7, Tailwind CSS 4 and React 19 islands. Pages are plain HTML and TypeScript
  unless a skill is built on a React package.
- **`/`** (`src/pages/index.astro`) lists the cards. Its data is `src/data/skills.json` (name,
  command, description, taken from each `SKILL.md`) merged with `src/data/meta/<name>.json`
  (title, kind, category and a one-line concept, written by the page's builder).
- **`/skills/<name>/`** (`src/pages/skills/<name>.astro`) is the example page. Optional parts are
  in `src/components/skills/<name>/` and its assets are in `public/skills/<name>/`.
- **Previews** are 1440×900 Playwright captures (`scripts/capture.mjs`) of each page loaded
  with `?shot`. Hovering a card swaps in the live page, scaled down in an iframe.
- `AGENTS.md` is the contract every page builder followed.

## Credits

### The skills — Meng To

All 91 skills come from **[Meng To](https://x.com/MengTo)**, founder of
[Neuform](https://neuform.ai), [Aura](https://aura.build) and [Design+Code](https://designcode.io).
They are published in [github.com/MengTo/skills](https://github.com/MengTo/skills) under the MIT
License and listed on [neuform.ai](https://neuform.ai) (each skill has a page at
`https://neuform.ai/skill/<name>`). The skill descriptions shown on the home page are quoted from
each skill's `SKILL.md`. Each skill's reference design and preview image come from the
community designs on Neuform. Where a page reuses one of a skill's demo assets, the
[photo credits](CREDITS.md) say so.

```
MIT License

Copyright (c) 2026 Meng To

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### The example pages

Built with [Claude Code](https://claude.com/claude-code). Each page was made by one agent
following one skill. [Rafael Paiva](https://github.com/paiva-it) set the brief and curated the
results.

### Libraries

| Library | Used for | Author | License |
| --- | --- | --- | --- |
| [Astro](https://astro.build) + [@astrojs/react](https://docs.astro.build/en/guides/integrations-guide/react/) | site framework | The Astro Technology Company and contributors | MIT |
| [React](https://react.dev) | islands for React-based skills | Meta Platforms, Inc. and contributors | MIT |
| [Tailwind CSS](https://tailwindcss.com) | styling | Tailwind Labs, Inc. | MIT |
| [three.js](https://threejs.org) | 3D and WebGL pages | mrdoob and three.js authors | MIT |
| [GSAP](https://gsap.com) (incl. ScrollTrigger) | timelines and scroll motion | GreenSock / Webflow | [Standard "no charge" license](https://gsap.com/standard-license) |
| [Lenis](https://github.com/darkroomengineering/lenis) | smooth scrolling | darkroom.engineering | MIT |
| [cobe](https://github.com/shuding/cobe) | canvas globe | Shu Ding | MIT |
| [globe.gl](https://github.com/vasturiano/globe.gl) | 3D data globe | Vasco Asturiano | MIT |
| [Matter.js](https://brm.io/matter-js/) | 2D physics | Liam Brummitt | MIT |
| [Vanta.js](https://www.vantajs.com) | WebGL backgrounds | Teng Bao | MIT |
| [border-beam](https://libraries.dev/beam), [metal-fx](https://metal.jakubantalik.com), [thinking-orbs](https://libraries.dev/orbs) | beam glow, liquid-metal borders, AI status orbs | Jakub Antalik | MIT |
| [Shaders](https://shaders.com) (`shaders/react`) | WebGPU cursor trail and ripples | Shader Effects, Inc. | [Shader Effects License](https://shaders.com) — free for personal, non-commercial and evaluation use only |
| [Unicorn Studio SDK](https://www.unicorn.studio) | optional embed on the `unicorn-studio` page (CDN, only with `?us=<project>`) | Unicorn Studio | see unicorn.studio |
| [Iconify](https://iconify.design) (`iconify-icon`) | icon and logo rendering | Vjacheslav Trushkin | MIT |
| [Playwright](https://playwright.dev) | previews and self-checks | Microsoft | Apache-2.0 |

**About Shaders:** this project is a personal, non-commercial study that runs locally. Its
`add-shader-cursor-trail` and `shaders-cursor-ripples` pages use Shaders under its free tier.
A public or commercial deployment of those pages needs a Shaders Pro or Team license.

### Icons and logos

- **[Solar](https://www.figma.com/community/file/1166831539721848736) icon set** by 480 Design,
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), served through Iconify.
- **[Simple Icons](https://simpleicons.org)** by the Simple Icons collaborators, CC0 1.0, served through Iconify. The
  `company-logos` page uses them. The logos are trademarks of their owners and appear only to
  demonstrate the logo-row technique. No company endorses or works with the fictional brands here.

### Fonts

All fonts are served by [Google Fonts](https://fonts.google.com) under the SIL Open Font License 1.1:
Anton, Archivo, Bebas Neue, Bodoni Moda, Bricolage Grotesque, Cormorant Garamond, DM Mono,
EB Garamond, Geist, Geist Mono, IBM Plex Mono, IBM Plex Sans Condensed, Instrument Sans,
Instrument Serif, Inter, Inter Tight, JetBrains Mono, Lexend, Martian Mono, Newsreader, Onest,
Plus Jakarta Sans, Schibsted Grotesk and Silkscreen.

### Photography and data

- **Photos:** from [Unsplash](https://unsplash.com), used under the
  [Unsplash License](https://unsplash.com/license). Some are stored in `public/skills/<name>/`
  (some graded or resized) and some are hotlinked. [CREDITS.md](CREDITS.md) lists each photo with
  its source and, where it could be traced, its photographer.
- **Skill demo assets:** a few pages reuse images from their skill's demo folder in
  [MengTo/skills](https://github.com/MengTo/skills), per [CREDITS.md](CREDITS.md).
- **Map data:** country shapes on the `globe-gl` page come from
  [Natural Earth](https://www.naturalearthdata.com) (public domain).
- Everything else, including textures, renders, procedural geometry, shaders, SVG illustrations
  and copy, was made for this repository.

If you own something here that is not credited correctly, open an issue and it will be fixed or
removed.
