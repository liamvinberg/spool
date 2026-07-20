> Research asset from the spool exploration session, 2026-07-20. Extraction-agent report, verbatim. Maps products adjacent to the spool concept and ranks the closest matches. Facts only; UNCONFIRMED marks preserved.

# Adjacent-Products Map: Agent-Authored Live-HTML Canvas Concept

*Research as of 2026-07-20. Every claim is sourced; items I could not directly confirm are marked UNCONFIRMED.*

## 1. Magic Patterns (magicpatterns.com)

**(a) Substrate:** Three view modes — Preview (single live screen), **Screens** (all screens on one infinite canvas), and Code (full React+TypeScript, Vite-style, Tailwind-styled project you can edit directly). Screens are generated from real code, not static mockups. [Getting Started docs](https://www.magicpatterns.com/docs/documentation/projects/getting-started), [prototyping docs](https://www.magicpatterns.com/docs/documentation/projects/prototyping)

**(b) Live interactivity:** Confirmed live — "because the mockups are real code, they're genuinely interactive and can capture hover, focus, inputs, and error states—not just static frames" (per aggregated review/search synthesis; underlying claim traces to Magic Patterns' own "produces editable components with clean Tailwind + React or Vue code, not pixel-only mockups" positioning). [magicpatterns.com/catalog/p/react](https://www.magicpatterns.com/catalog/p/react)

**(c) Multi-frame flows:** Yes, and this is the most complete implementation found in this whole survey. Enter Prototype mode (shortcut `P`), hover an element until it highlights, click it, then click the destination screen — **"you should see an arrow connecting those two screens."** A "Play" button opens a separate window to walk the live, linked flow end-to-end. [Prototyping docs](https://www.magicpatterns.com/docs/documentation/projects/prototyping)

**(d) Agent/AI surface:** Official MCP server (`mcp.magicpatterns.com`), documented at [MCP overview](https://www.magicpatterns.com/docs/documentation/features/mcp-server/overview). Exposes `create_design`, `send_prompt`, `publish_artifact`, design-metadata reads, etc.; supports OAuth (Claude.ai, Cursor) or API-key auth; has a read-only endpoint that strips destructive tools. Framed explicitly as "a workflow to go roundtrip between design and code" — i.e., a bridge for external agents, not the primary authoring loop (that's Magic Patterns' own in-house AI chat, supporting React, HTML/Tailwind, ShadCN, Chakra, Mantine output). A separate community-built MCP wrapper also exists at [github.com/ryanleecode/magic-patterns-mcp](https://github.com/ryanleecode/magic-patterns-mcp) (unofficial, distinct from the first-party server).

**(e) Positioning + pricing:** "AI Prototype Generator for Product Teams." [Pricing](https://www.magicpatterns.com/pricing): Free (50 credits/mo), Starter $20/seat/mo, Business $100/seat/mo, Enterprise custom; 15% annual discount; overage $0.02/credit. Legacy subscribers keep $19/$75 pricing until June 30, 2026. [New Plans announcement](https://www.magicpatterns.com/blog/new-plans-and-pricing)

**(f) Praise/criticism:** Praised for multiplayer canvas with live cursors/shared selections, and for Figma-library/token/code design-system import so generations "stay on-brand." [Getting Started docs](https://www.magicpatterns.com/docs/documentation/projects/getting-started)

---

## 2. Onlook (onlook.com)

**(a) Substrate:** The **real DOM of your actual running app** — not a mockup. Architecture (confirmed via direct fetch): "Onlook is technically a browser that points to your localhost running the app... manipulate the DOM like a Chrome Devtool"; a web container (CodeSandbox SDK + Bun runtime, per search-derived detail — UNCONFIRMED by direct fetch) spins up the project; the editor instruments the served bundle with `data-oid` attributes at build time, so visual edits locate the corresponding JSX, patch an AST, and trigger an HMR reload. [Architecture docs](https://docs.onlook.com/developers/architecture)

**(b) Live interactivity:** Yes by construction — it's your actual dev server, so real JS, animations, and inputs all run natively. Changes are non-persistent until written back to code.

**(c) Multi-frame flows:** **Not found.** Onlook mounts one project as one live view you navigate like a browser/devtool; I found no evidence of a Figma-style canvas showing multiple pages/screens arranged spatially, nor any screen-linking/arrow feature. Mark this absence UNCONFIRMED-by-omission rather than an explicit denial — Onlook's own docs simply don't address multi-page canvas layout either way. [Architecture docs](https://docs.onlook.com/developers/architecture), [GitHub](https://github.com/onlook-dev/onlook)

**(d) Agent/AI surface:** In-house AI layer (Morph Fast-Apply + OpenRouter, per search-derived detail, UNCONFIRMED by direct fetch) streams code edits via diff-match-patch so canvas and file tree update together. No MCP server found in this research (absence, not confirmed denial).

**(e) Positioning + pricing:** "The Cursor for Designers" — open source (Apache 2.0), self-hostable free via [GitHub](https://github.com/onlook-dev/onlook). Cloud/team pricing is custom/contact-only; product was in **closed beta** at time of research. [Pricing page](https://www.onlook.com/pricing)

**(f) Praise/criticism:** Positioned as an open-source alternative to Bolt.new, Lovable, v0, Replit Agent, Figma Make, and Webflow. [BrightCoding writeup](https://www.blog.brightcoding.dev/2025/09/05/onlook-the-open-source-cursor-for-designers-that-lets-you-visually-build-style-and-edit-react-apps-with-ai/)

---

## 3. tldraw — Make Real, tldraw computer, Agent SDK

**tldraw itself is an SDK/infrastructure layer**, not one end-user product — it now underpins canvas experiences in Google Stitch, Replit, Shopify, BlackRock, Autodesk, ClickUp, Luma, Runway, and others. [github.com/tldraw/tldraw](https://github.com/tldraw/tldraw)

**Make Real (a-c):** Substrate is **real HTML in an iframe, embedded as a native tldraw shape** — "the tldraw canvas has always been made of regular HTML, so its canvas can support iframes directly." Flow: draw a wireframe → select → "Make Real" → screenshot sent to GPT-4V (or Claude/Gemini) → returned HTML rendered live in an iframe shape you can resize to test responsive breakpoints, annotate, and resubmit for iteration. [tldraw.dev blog](https://tldraw.dev/blog/make-real-the-story-so-far), [make-real repo](https://github.com/tldraw/make-real), [make-real-starter repo](https://github.com/tldraw/make-real-starter). **No evidence of formal screen-to-screen flow-linking/connection arrows** between generated iframes — you can arrange iterations side by side, but there's no "connect and walk the flow" feature like Magic Patterns'.

**tldraw computer (computer.tldraw.com):** A separate, more experimental product — a canvas of interconnected "components" (text, image, audio blocks) forming AI-workflow graphs powered by Gemini 2.0 Flash; output of one block feeds the next. This is a **visual pipeline/workflow tool, not a UI-screens prototyping surface**. [Google's own showcase of it](https://ai.google.dev/showcase/tldraw), [launch coverage](https://the-decoder.com/tldraw-unveils-experimental-natural-language-computer-powered-by-gemini-2-0/). My direct fetch of computer.tldraw.com returned only a bare title (UNCONFIRMED whether it's still actively maintained vs. left up as a legacy demo).

**Agent SDK / Agent starter kit (d):** [tldraw.dev/starter-kits/agent](https://tldraw.dev/starter-kits/agent), MIT-licensed, [github.com/tldraw/agent-template](https://github.com/tldraw/agent-template). Lets an AI agent create/update/delete shapes, draw pen strokes, and do multi-shape ops (rotate/align/distribute/stack), manage viewport, and call external APIs. This is about **agents manipulating diagram/drawing shapes** — no live HTML/iframe support and no MCP server in this kit specifically.

**(e/f):** No unified pricing story since tldraw is consumed as an SDK by third parties; general SDK licensing/pricing UNCONFIRMED (not deeply verified this session — see report 04 §1 for the license terms verified separately).

---

## 4. Framer (framer.com)

**(a) Substrate:** Real DOM/React. "The canvas was made in React, so it can render any React Component, including the ones you code yourself right inside the tool." Code Components render live **on the canvas, in preview, and on the published site simultaneously**. [Code Components docs](https://www.framer.com/developers/components-introduction)

**(b) Live interactivity:** "Framer components render as live HTML in the browser, with variants triggered by real interactions." Code Components/Overrides support real state, API data, animations (tabs, accordions, calculators, configurators, product demos). Whether every interaction fires directly on-canvas vs. requires Preview mode was not explicitly confirmed by source text — flagged UNCONFIRMED nuance, though the real-DOM architecture strongly implies canvas-live behavior. [Code Components docs](https://www.framer.com/developers/components-introduction)

**(c) Multi-frame flows:** Framer has long supported page-to-page navigation via real hyperlinks (since Framer output is a real, live website) rather than an overlaid Figma-style "connect frames with arrows" prototype mode. I could not obtain a fresh 2026 source describing a dedicated visual connection-arrow feature — mark UNCONFIRMED.

**(d) Agent/AI surface:** Two AI features: **Workshop** (in-editor AI component builder — describe a component in natural language, get a functional code-based component with property controls, inherits project fonts/colors; runs on Claude 4.5 per search-derived detail) [Workshop marketplace page](https://www.framer.com/marketplace/plugins/workshop/), and **Wireframer** (prompt → multi-page, mobile-responsive wireframe with real copy in under 60 seconds, generating editable layers not locked images; integrated ~May 2025; available on the Free plan) [framer.com/wireframer](https://www.framer.com/wireframer/), [Academy lesson](https://www.framer.com/academy/lessons/generating-layouts-with-ai-using-wireframer). **MCP support is a third-party community plugin**, not first-party: "The Framer MCP plugin, built by Tommy D. Rossi, connects Framer to Claude Desktop or Cursor via the Model Context Protocol," used mainly for CMS/SEO work, not canvas authoring. [oma-kase.com writeup](https://www.oma-kase.com/blog/framer-ai-features)

**(e) Positioning + pricing:** Free $0; Basic $10/mo annual ($15 monthly); Pro $30/mo annual ($45 monthly); Enterprise custom. Editor seats $20/mo; Content Editor seats $10/mo. AI Agent Credits: 1,000/mo (Basic), 3,000/mo (Pro). Add-ons: Localization $20/locale, Advanced Hosting $200, Convert A/B testing $50/500k events. [Framer pricing](https://www.framer.com/pricing)

**(f) Praise/criticism:** Workshop called "the most underrated AI feature in Framer" by one reviewer. [oma-kase.com](https://www.oma-kase.com/blog/framer-ai-workshop-plugin) Wireframer praised for solving "the hardest part of web design – the information architecture."

---

## 5. v0 by Vercel (v0.app)

**(a) Substrate:** Sandboxed preview VMs running generated Next.js/React projects (Design Mode operates on Tailwind + shadcn/ui specifically — "currently only supports Tailwind based UIs and has full knowledge of shadcn/ui"). [Design Mode announcement](https://community.vercel.com/t/introducing-design-mode-on-v0/13225)

**(b) Live interactivity:** Design Mode (Option/Alt+D) is a **single-project visual element editor** — select an element, edit spacing/copy/color without touching code or spending credits — not a canvas surface.

**(c) Multi-frame flows:** **No canvas, no flow-linking found.** I searched the v0 changelog directly and confirmed: "the changelog does not mention multi-screen flows, linking screens together, or arrow/connection features between pages." v0 can generate multi-page Next.js apps with routing and shared navigation (a single project can have many routes), but there is no design-canvas surface for arranging or connecting them visually. [v0 changelog](https://v0.app/changelog)

**(d) Agent/AI surface:** v0 MCP server (mentioned in changelog: adds tools to create/find/read chats, fetch a preview, send messages) and a Platform API v2 (beta) that can start a chat from a GitHub repo. [v0 changelog](https://v0.app/changelog)

**(e) Positioning + pricing:** "Build Full-Stack Web Apps with AI." Pricing not independently re-verified this session (out of scope of what was fetched — UNCONFIRMED, not included to avoid stale/wrong figures).

**(f) Praise/criticism:** Recent changelog emphasis has been on speed (faster VM preview startup) and reliability (sandboxes no longer time out mid-generation on long agent runs) rather than design-surface expansion. [v0 changelog](https://v0.app/changelog)

---

## 6. Subframe (subframe.com)

**(a) Substrate:** "Frames/artboards map directly to real React components rather than static mockups. Every visual layer corresponds to production code." Positioned as "The AI-native design tool built for code." [subframe.com](https://www.subframe.com/)

**(b) Live interactivity:** Implied live given the real-component substrate; not explicitly demonstrated in source text (UNCONFIRMED at the granular JS/animation level).

**(c) Multi-frame flows:** Nuanced and important: Subframe has **"Flows,"** but these are folders for *organizing* pages by product area/status/state (Onboarding, Profile, Settings, etc.) — not connections. [Organizing pages using flows](https://help.subframe.com/en/articles/10153192-organizing-pages-using-flows) Separately, **"Basic prototyping"** does let you connect pages together with click interactions and navigate via toolbar/arrow-keys during preview. [Basic prototyping](https://help.subframe.com/en/articles/10472085-basic-prototyping), [Page preview mode](https://help.subframe.com/en/articles/9967556-page-preview-mode) Critically: **"it's not currently possible to link flows or pages together in Subframe"** — the organizational Flows themselves are independent silos, distinct from Magic Patterns' persistent visual connector-arrow model.

**(d) Agent/AI surface:** MCP server + "Agent Skills" for Cursor and Claude Code, serving "the full design system as living context — components, theme, patterns, and user docs — in real time." [subframe.com](https://www.subframe.com/), [Subframe vs. best Figma alternative](https://www.subframe.com/tips/best-figma-alternative)

**(e) Positioning + pricing:** "Ship what you design." Pricing reported by a third-party review as $29/month per editor with unlimited AI generation, no per-call metering (UNCONFIRMED against Subframe's own pricing page, which returned a 403 on direct fetch). [Banani review](https://www.banani.co/blog/subframe-ai-review)

**(f) Praise/criticism:** Subframe's own marketing claims its design-system-as-context approach is "roughly 20x less token-intensive than sending Figma files or Paper canvases to an agent" (self-reported, not independently verified). [Banani review](https://www.banani.co/blog/subframe-ai-review)

---

## 7. Play (createwithplay.com)

**(a) Substrate:** Notably different from every other product in this survey — **real native SwiftUI**, not HTML/DOM. "A freeform canvas with access to real native elements like maps, pickers, and input text fields." [Search-derived from createwithplay.com; direct fetches of createwithplay.com and its subdomains failed with DNS errors in this environment, so all Play findings here are search-snippet-derived and should be treated as lower-confidence/UNCONFIRMED by direct source inspection.]

**(b) Live interactivity:** Yes — "Play AI is built into the design canvas," supports advanced interaction logic (arrays, loops, expressions) and real gestures (drag, pan, scroll).

**(c) Multi-frame flows:** Search snippets describe designing/prototyping "complex flows and interactions," but I could not confirm a specific visual connection-arrow mechanism (UNCONFIRMED — direct fetch failures prevented verification).

**(d) Agent/AI surface:** "Play AI" built into the canvas (proprietary, not general MCP/agent-pluggable per evidence found).

**(e) Positioning + pricing:** Major, dated, and highly notable development: **Apple acquired Play** (and its maker, Rabbit 3 Times). **Starting April 20, 2026, Play discontinued its iOS and macOS apps**, with prorated refunds for paid users; the "Play to Xcode" export feature remains and was made free post-acquisition. Play won an Apple Design Award for innovation in 2025. [Korben.info](https://korben.info/en/play-apple-acquires-swiftui-prototyping-tool.html), [Cult of Mac](https://www.cultofmac.com/news/apple-acquires-play-swiftui-app) Exact historical pricing tiers UNCONFIRMED (fetch failures).

**(f) Praise/criticism:** Widely covered as a rare case of Apple directly acquiring a third-party prototyping tool rather than building competing tooling — read by commentators as Apple absorbing prototyping-to-Xcode capability in-house.

---

## 8. Lovable / Bolt.new (brief per instructions)

**Lovable:** Chat-to-full-stack-app builder. Its "Prototypes" offering is framed as full interactive working applications (Supabase auth/DB, Confluence/Jira/Linear/Notion context import, GitHub sync for hand-off) rather than a Figma-style multi-screen canvas. [lovable.dev/prototypes](https://lovable.dev/prototypes) Third-party comparisons state Lovable "lacks multi-screen canvas diagramming capabilities" — this is a third-party characterization (e.g., [UX Pilot vs. Lovable](https://uxpilot.ai/blogs/ux-pilot-vs-lovable)), not Lovable's own claim, so treat as UNCONFIRMED-as-official-admission though directionally consistent with Lovable's own positioning (single-app, not canvas).

**Bolt.new:** Drag-and-drop visual editor with live preview and split-screen code/preview; Figma's own comparison piece notes **"Like v0, Bolt is primarily a solo experience with limited real-time collaboration."** [Figma AI prototyping tools](https://www.figma.com/resource-library/ai-prototyping-tools/) Its Expo integration scaffolds React Native screens + navigation for mobile apps (multi-screen, but code/nav-level, not a design canvas). [Expo × Bolt announcement](https://expo.dev/blog/bolt-expo-integration-announcement)

---

## 9. Google / OpenAI / Anthropic 2025-2026 canvas-adjacent products

**Google Opal** — [developers.googleblog.com launch post](https://developers.googleblog.com/introducing-opal/), public beta since July 2025. This is a **workflow/automation builder**, not a UI-screens canvas: steps are things like "User Input → AI Generate → Output," chained via a visual step editor or natural language. Does not generate app screens/frames in the sense this research is mapping.

**Google AI Studio Build mode** — [official docs](https://ai.google.dev/gemini-api/docs/aistudio-build-mode). A single live-preview pane (right side) alongside a Code tab and an "annotation mode" (highlight part of the UI, describe a change). Powered by the "Antigravity Agent" harness. **No multi-screen canvas or flow-linking** — one app, one preview, iterated conversationally.

**Google Product Canvas** (Google Labs experiment, January 2026, led by Roman Nurik) — genuinely close to the concept and worth flagging even though not asked for by name: an infinite, multiplayer canvas (Firebase sync, WebRTC video/cursors) with a **voice-first AI agent** (Gemini Live API) and **in-browser live-preview React+Tailwind mini-apps compiled via esbuild-wasm** (supports npm imports). Framed as a brainstorming tool — "working prototypes on the canvas" sit alongside personas, sketches, and docs as brainstorming artifacts. Explicitly references Stitch's "on-canvas prototypes" as an inspiration. [labs.google/code/experiments/product-canvas](https://labs.google/code/experiments/product-canvas) No evidence of flow-linking between multiple generated prototypes, and it's positioned as an experiment, not a shipped production tool.

*(Google Stitch itself — relaunched March 2026 with an infinite canvas, context-aware design agents, and instant prototyping — is intentionally not covered in depth here; see report 02 §3; flagged via [third-party comparison](https://www.nxcode.io/resources/news/vibe-design-tools-compared-stitch-v0-lovable-2026).)*

**OpenAI Canvas** — was fundamentally a **text/code collaborative editing surface** (like a shared document with inline diffs), not an infinite canvas of live app screens, even at its peak. As of **May 28, 2026, OpenAI removed Canvas from GPT-5.5 Instant and GPT-5.5 Thinking**, folding writing/coding into inline "writing blocks" and "code blocks" in the chat thread itself; access persists only on legacy models being sunset through mid-to-late 2026 (o3 retires August 26, 2026). One analysis frames this explicitly: Canvas was "OpenAI's bet on a different interaction paradigm for AI... modeled on what Anthropic shipped with Claude's Artifacts and what Google later did with Gemini," abandoned because a separate panel didn't render consistently across ChatGPT's phone/tablet/web/desktop surfaces. [Krasa.ai](https://www.krasa.ai/news/openai-gpt-5-5-instant-writing-coding-blocks-canvas-removed-may-2026), [removal coverage](https://www.blakerowley.ai/articles/openai-pulls-canvas-back-into-chat), [original Canvas announcement (fetch blocked, 403 — URL provided for reference only)](https://openai.com/index/introducing-canvas/)

**OpenAI Apps SDK / "apps in ChatGPT"** — lets individual interactive widgets (e.g., Spotify playlist builders) surface inline in a chat conversation when triggered by name. This is **not an infinite canvas or a multi-frame flow surface** — each app is a standalone in-chat widget, not a linkable frame among many. [Introducing apps in ChatGPT](https://openai.com/index/introducing-apps-in-chatgpt/), [Apps SDK UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)

**Anthropic Claude Code Artifacts** — launched in beta **June 18, 2026**, for Claude Code users on Team/Enterprise plans. Turns a coding session into a **private, live, shareable HTML page** on a claude.ai URL, grounded in the actual local repo, connected MCP tools, and the conversation. Live-refresh in place (preserves viewer scroll position), full version history. Hard technical ceiling: **16 MiB cap, strict CSP blocking all external network calls/scripts/fonts**, all CSS/JS inlined, images embedded directly, **no multi-route support and no form submissions**. [VentureBeat](https://venturebeat.com/data/anthropics-claude-code-artifacts-update-brings-live-shared-dashboards-and-interactive-workspaces-to-enterprises), [DigitalApplied](https://www.digitalapplied.com/blog/claude-code-shareable-artifacts-live-web-pages-2026), [Claude Help Center](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them). This is a live-HTML, agent-authored surface, but explicitly **one page at a time — no infinite canvas, no multi-frame flow-linking.**

---

## Closest matches to the full concept — ranking

Full concept restated: **(1)** frames authored primarily by AI agents, **(2)** frames are live-interactive HTML/JS, **(3)** a Figma-feel infinite canvas, **(4)** clickable flow links with visible connections between frames, **(5)** hand-off to production code.

Search terms used beyond the required list: `"AI prototyping canvas" live HTML frames agent authored`, `infinite canvas iframe prototypes AI agent flow links production code`, `"Figma alternative" live code frames AI agent flow arrows`. These surfaced several products not in the original list: **Reframe**, **AgentCanvas**, **Pencil.dev**, **Wayframe**, **Google Product Canvas** (covered above), and **Superdesign**.

### #1 — Magic Patterns
Has 4 of 5 confirmed solidly: live React-code frames ✓, infinite multiplayer canvas ✓, **explicit connection-arrow flow-linking with a "Play" walkthrough mode** ✓ (the only product in this entire survey with a confirmed, named, visual arrow-based flow feature), and hand-off to a real React/TS/Tailwind/Vue project ✓.
**What it lacks:** "authored primarily by AI agents" in the Claude Code/Cursor/Codex-native sense. Its primary authoring loop is Magic Patterns' own proprietary in-house AI chat; the MCP server exists but is explicitly framed as a round-trip *bridge* for external agents, not the main way frames get created. [MCP overview](https://www.magicpatterns.com/docs/documentation/features/mcp-server/overview)

### #2 — Pencil.dev
An "infinite canvas" purpose-built "for AI agents," with an MCP integration to Claude Code that's bidirectional (design↔code, zero information loss per their claim), and the tightest code hand-off of anything surveyed — designs live as `.pen` files directly in your repo, not exported/translated afterward. [pencil.dev](https://www.pencil.dev/), [search-derived detail via Julian Goldie writeup](https://juliangoldie.com/pencil-dev/)
**What it lacks:** No confirmed visual flow-linking/connection-arrow feature — multi-page "connectedness" described in sources is about code-level navigation ("all connected, all responsive"), not a Figma-style click-to-link-screens UI. Also requires a separate Claude Code subscription (~$20/mo) for AI generation, and was in early access at time of research.

### #3 — Reframe (github.com/ilya-makarov-dev/Reframe)
Open-source, and the most philosophically aligned with "agents live inside the canvas" — literally its tagline, with **7 MCP tools** (design/compile/inspect/edit/export/project/ui) built for "any MCP agent (Claude, Codex, Cursor)." Substrate is genuinely **real HTML in an iframe** (not vector nodes), with CSS 3D "Present mode," drag/resize/inline-edit, and incremental DOM patching over SSE. [GitHub](https://github.com/ilya-makarov-dev/Reframe)
**What it lacks:** No confirmed flow-linking/connection-arrow feature (only a code-level "cross-page nav wired" skill pattern); very early-stage (~11 stars, 4 forks, 53 commits at time of research) — unproven at production scale, unlike the other two.

**Honorable mentions that didn't make top 3, with why:** **AgentCanvas** ("the infinite canvas your AI agents control over MCP," sandboxed-iframe substrate, SSE streaming) has agent-authorship and live HTML nailed, but explicitly lacks flow-linking and reads more as a live "watch the agent build" spectator canvas than a design-to-production pipeline — no confirmed code hand-off. [developersdigest.tech/agentcanvas](https://www.developersdigest.tech/agentcanvas) **Wayframe** ("agent writes production-ready React components — rendered live") turned out on inspection to be positioned around motion/video/creative demos ("Wayframe is for teams that need motion, not just screens") rather than multi-screen app flows — a different product category wearing similar language. [wayframe.com](https://wayframe.com/) **Superdesign** (open-source VS Code extension, canvas panel + chat sidebar, "Design to Code — From Canvas Straight Into Your Repo") is agent-first and has an infinite canvas, but I found no evidence of a flow-linking feature and its primary shape is IDE-embedded mockup generation rather than a standalone multiplayer prototyping surface. [GitHub](https://github.com/superdesigndev/superdesign), [Design-to-code](https://app.superdesign.dev/design-to-code)

**Net takeaway:** nothing found fully satisfies all five criteria simultaneously. The products that nail agent-authorship (Reframe, Pencil.dev, AgentCanvas) are all missing the visual flow-link/connection-arrow layer; the one product that nails flow-linking (Magic Patterns) treats agent-driven authoring as secondary to its own built-in AI.
