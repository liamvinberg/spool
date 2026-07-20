> Research asset from the spool exploration session, 2026-07-20. Extraction-agent report, verbatim. Facts only; every claim sourced; UNCONFIRMED marks preserved.

# Paper (paper.design) — Research Report

*Research conducted 2026-07-20. Sourced from Paper's own site/docs/MCP server (fetched directly), Hacker News (via HN Algolia API), independent reviews, and the live Paper MCP plugin installed in this environment. Note: search results are frequently polluted by unrelated products sharing the name "Paper" (PaperMC/Minecraft, Papers reference-manager app, paper.li) — these are excluded below.

---

## 1. Document model

**Core architecture: real HTML/CSS/DOM, not a proprietary scene graph.** Paper's own positioning is explicit that the canvas *is* web technology, not a drawing of it: *"If the canvas is built on the same standards as the product—html, css, dom—then you're not drawing a metaphor of a UI. You're working in the medium... a place where HTML and CSS are the medium, *and* the output."* — [paper.design/blog/a-real-space-to-design-in-the-age-of-agents](https://paper.design/blog/a-real-space-to-design-in-the-age-of-agents) (Feb 27, 2026). The compare page reinforces this: Paper = "Real HTML/CSS — web-native, no translation step" vs. Figma = "Proprietary model (WebGL-based canvas)" — [paper.design/compare/figma](https://paper.design/compare/figma).

**Yes, HTML is converted into a node/layer tree** (Figma-like UX: layer tree, artboards, parent/child hierarchy, selection), confirmed by the MCP tool surface itself: `get_children` (parent→children), `get_tree_summary` (subtree hierarchy), `move_nodes` (reparent while preserving IDs), `get_node_info` (parent, children, visibility, lock state) — [paper.design/docs/mcp](https://paper.design/docs/mcp). So structurally it behaves like Figma's node tree, but the nodes' underlying representation is real DOM/CSS rather than a proprietary vector format.

**Confirmed node/"component types"** (Paper's own term, seen in tool schemas and docs — there is no single published canonical enum of all types, so this list is reconstructed from primary sources, not a copy of one official table):
- **Text** — explicit: `set_text_content` "Only works on nodes with component type `Text`" (live tool schema).
- **Artboard / Frame** — `create_artboard`: "new artboard (**top-level frame**)"; pasted HTML `<input>` elements "transform to frames with text children" — [paper.design/docs/paste/html](https://paper.design/docs/paste/html).
- **Vector/SVG** — a distinct editable vector node with path/point editing, pen tool, fill/stroke — [paper.design/docs/svg](https://paper.design/docs/svg).
- **Image** — appears to be modeled as an **image fill on a node** rather than its own node type, mirroring Figma's fill model (`get_fill_image`: "Extract image data from a **node that has an image fill**").
- Generic parent/child/group relationships exist (via `move_nodes`/`duplicate_nodes`/`get_children`) but no node explicitly called "Group" appears in any source found.

UNCONFIRMED: a complete, official enumeration of every component type (e.g., whether "Rectangle," "Group," "Component/Instance" exist as first-class types distinct from generic Frames). Paper does not appear to publish one; this had to be inferred.

**What's lost converting HTML → Paper** (from Paper's own docs, [paper.design/docs/paste/html](https://paper.design/docs/paste/html), confirmed verbatim on 2026-07-20):
- *"Only inline styles are supported. Class names will be dropped, and any style applied through a CSS selector will be ignored."*
- No rich text: block elements with inline children flatten to a single text node; inline elements become inline-block.
- `<input>` fields become a frame + text children (form semantics are lost).
- All elements forced to `box-sizing: border-box`; redundant styles (e.g. gap on non-flex containers) stripped.
- **JavaScript/event handlers are never mentioned anywhere** in Paper's docs, the MCP tool guide, or the `write_html` tool schema — the only custom element supported is `<x-paper-clone node-id="...">` for cloning existing nodes. The `write_html` tool's own instructions (live schema) explicitly forbid `margin`, `display: inline`, `display: grid`, and HTML tables, and require inline styles only — reinforcing that this is a styling/layout import, not a live-code import.
- The write_html tool schema also states: *"Styles you set that are inert in the node's context are dropped rather than applied; their keys are returned under the `ignoredStyles` property"* (live `update_styles` schema) — i.e., Paper silently discards CSS it can't represent.

**What's lost converting Figma → Paper** (from the official Figma-import guide, retrieved directly from the live Paper MCP server via `get_guide({topic:"figma-import"})`, and mirrored in [paper.design/docs/paste/figma](https://paper.design/docs/paste/figma)):
- Components, instances, and variables are **detached** on paste; code-connected Figma components "are not reliably converted."
- Masks are hidden by default; diamond gradients become radial (CSS has no diamond gradient); radial-gradient rotation angles are dropped; arbitrary dash lengths, gradient strokes, and excluded-layout strokes don't convert.
- Noise, texture, "glass" (becomes plain blur), repeat, and symmetry effects don't transfer; inner shadows apply to children rather than the parent; blend-mode "pass-through" has no CSS equivalent.
- Agents are separately warned to "ignore ... spacer elements," and that "very large and deeply nested designs can cause errors."
- The write_html tool requires **all values fully resolved to literal CSS** before writing — no design-token variables, no Tailwind classes — the agent must resolve everything itself first (live `get_guide` "figma-import" content).

**Design tokens** are a related but separate layer of the document model: CSS custom properties covering `color, fontFamily, fontWeight, fontSize, lineHeight, letterSpacing, spacing, container, breakpoint, radius`. Notably, *"Tokens can only be created via the MCP at this time"* — there's no in-app UI to author new tokens, only to consume/detach them — [paper.design/docs/tokens](https://paper.design/docs/tokens).

---

## 2. Interactivity / prototyping today

**Confirmed: Paper has no prototyping, frame-linking, play/preview mode, animation timeline, or embedded-JS interactivity today (as of 2026-07-20).** This is a well-triangulated negative finding:

- The full, verbatim **public roadmap** — [paper.design/roadmap](https://paper.design/roadmap) — lists every Shipped/In Progress/Coming Soon/Planned item (fetched and parsed directly) and contains **zero** mentions of prototyping, interaction states, click-through flows, frame links, or a play/preview mode.
- The full, verbatim **build log** from Sept 9, 2025 (open-alpha launch) through June 2026 — [paper.design/build-log](https://paper.design/build-log) — likewise never mentions any of these, across 11 dated monthly entries covering hundreds of shipped items.
- Independent hands-on review: *"No interactive prototypes out of the box"* is listed as an explicit con vs. competing AI design tools — [uxpilot.ai/paper-design](https://uxpilot.ai/paper-design).
- Independent comparison test (named author, hands-on rebuild benchmark, published Apr 7, 2026): explicitly contrasts Figma's "Figma Make" prototyping with Paper, for which "no prototyping capabilities" are described at all — [bykatharina.com/blog/paper-design-vs-figma-two-different-bets-on-the-future-of-design](https://www.bykatharina.com/blog/paper-design-vs-figma-two-different-bets-on-the-future-of-design).
- Third-party comparison guide (Mar 12, 2026): *"Components, collaboration, and advanced prototyping are still developing"* — [sfailabs.com/guides/figma-mcp-vs-paper](https://sfailabs.com/guides/figma-mcp-vs-paper).

**What's planned that is animation-*adjacent* (but is not interactivity/prototyping)**, per the roadmap:
- "Generate Videos" (planned) — generating/embedding video assets.
- "Lottie/Rive/YouTube embeds" (planned) — *"Paste your animations into designs... in one place with the rest of your work"* — this is embedding pre-rendered animation assets, not building click-through interaction logic.
- "Paper Shaders: more effects and textures" (in progress) — GPU visual effects (mesh gradients, liquid metal, halftone, etc.), which are decorative/visual, not behavioral.
- "Script and prompt engine" (planned) — *"Open the scripter pane and write Paper code or prompt new tools in real time to create entirely new ways of working"* — reads as a way to **extend the design tool itself** (custom macros/tools), not to add runtime JS behavior to shipped designs. UNCONFIRMED exactly what this entails; Paper hasn't elaborated beyond one sentence.

**Company's own stated philosophy** leans toward defending the static canvas rather than promising prototyping: *"You can't scale design decisions in a chat box"*; the canvas is framed as *"where humans do the part agents are bad at: holding ambiguity, comparing paths, deciding what matters"* — [paper.design/blog/a-real-space-to-design-in-the-age-of-agents](https://paper.design/blog/a-real-space-to-design-in-the-age-of-agents). Nothing in this post promises click-through prototypes; it argues for *spatial* (multiple static variations side by side) rather than *behavioral* (interactive flows) iteration.

---

## 3. Agent surface

**MCP tool surface.** Comparing Paper's **public docs** list against the **live tool schema** actually shipped in the `paper-desktop` plugin (installed and connected in this environment, server at `http://127.0.0.1:29979/mcp`) shows the docs undercount the real surface by 13 tools:

| Tool | In public docs? | Purpose |
|---|---|---|
| `get_basic_info` | ✅ | File/page/artboard/token overview |
| `get_selection` | ✅ | Currently-selected node(s) |
| `get_node_info` | ✅ | Single node detail |
| `get_children` | ✅ | Direct children of a node |
| `get_tree_summary` | ✅ | Compact subtree hierarchy |
| `get_screenshot` | ✅ | Base64 image of a node |
| `get_jsx` | ✅ | JSX (Tailwind or inline-styles) |
| `get_computed_styles` | ✅ | Batch computed CSS |
| `get_fill_image` | ✅ | Extract a node's image fill |
| `get_font_family_info` | ✅ | Font availability/weights |
| `get_guide` | ✅ | Guided workflows (e.g. figma-import) |
| `export` | ✅ | PNG/JPG/SVG/WebP/AVIF/PDF/MP4 |
| `create_artboard` | ✅ | New top-level frame |
| `write_html` | ✅ | Parse HTML into nodes (insert or replace) |
| `set_text_content` | ✅ | Batch text updates on Text nodes |
| `rename_nodes` | ✅ | Batch layer renames |
| `duplicate_nodes` | ✅ | Deep clone + ID map |
| `move_nodes` | ✅ | Reposition/reparent, preserves IDs |
| `update_styles` | ✅ | Batch CSS updates |
| `delete_nodes` | ✅ | Delete node + descendants |
| `finish_working_on_nodes` | ✅ | Clear "agent working" indicator |
| `export_combined_pdf` | ❌ not in docs | Multi-node → single multi-page PDF |
| `find_nodes` | ❌ not in docs | Search by computed style / token / text content |
| `create_file` | ❌ not in docs | New file (optionally cloned) |
| `create_page` | ❌ not in docs | New page within a file |
| `open_file` | ❌ not in docs | Open file by ID/URL, pins it for later calls |
| `list_files` | ❌ not in docs | List team's files, most-recent-first |
| `create_tokens` / `get_tokens` / `set_tokens` | ❌ not in docs | Design-token CRUD (color, spacing, type scale, etc.) |
| `get_comment_thread` / `list_comment_threads` / `list_comment_thread_authors` / `set_comment_thread_status` | ❌ not in docs | Read/resolve canvas comment threads |

(Docs list: [paper.design/docs/mcp](https://paper.design/docs/mcp), 20 tools listed. Live count: 33 tools, confirmed directly from the installed plugin's tool schemas on 2026-07-20.) This gap is consistent with Paper's own stated pace — *"We ship to production nearly every day"* ([paper.design/roadmap](https://paper.design/roadmap)) — outrunning docs updates.

**Selection sharing mechanism.** There is no push/subscription channel found — `get_selection` is a **pull-based** call ("Get detailed information about the currently selected nodes" — agent must actively ask). Separately, Paper shows a real-time **"working indicator"** on the canvas while an agent is editing (`finish_working_on_nodes`: *"Remove the working indicator from artboards you were editing"*), and the June 2026 build log adds *"Teammate **and agent** presence in file"* plus an *"Option to reduce agent animations"* — i.e., the agent's live activity is shown to human collaborators as a presence/animation signal on canvas, separate from selection state itself. (Sources: live tool schemas; [paper.design/build-log](https://paper.design/build-log).)

**No REST API, no plugin API, no documented file format exist beyond the MCP server.** The entire public docs site has only 6 sections — MCP, Snapshot, Tokens, Support, Paste, SVGs (plus a contact page) — confirmed by fetching [paper.design/docs](https://paper.design/docs) directly; no REST/webhook/plugin-API/file-format documentation was found anywhere on the site or via targeted search.

**Connecting the MCP server**: requires the Paper Desktop app running locally with a file open (auto-starts an HTTP MCP server on `127.0.0.1:29979`); official first-class integrations exist for Cursor, Claude Code (CLI, plugin, and Desktop config), Codex, GitHub Copilot (VS Code), Antigravity, and OpenCode — [paper.design/docs/mcp](https://paper.design/docs/mcp). Distributed via a GitHub-hosted plugin repo, [github.com/paper-design/agent-plugins](https://github.com/paper-design/agent-plugins) (MIT license, ~10 GitHub stars at last check).

---

## 4. Platform shape

**Desktop vs. web**: both exist. Desktop app v0.5.0 (dated 18-07-26, i.e. 2 days before this research) ships for **macOS (ARM), Linux (AppImage/Deb/RPM), and Windows (x64)** — [paper.design/downloads](https://paper.design/downloads). A browser version also exists at `app.paper.design` (referenced from the homepage). MCP/agent access requires the **desktop** app specifically (the local HTTP server needs a native process).

**Local vs. cloud files**: Paper is cloud/team-based, not local-file-first. Directly observing the live `list_files` MCP response in this environment shows files are scoped to a cloud **team** (a `teamId`/`teamName` structure with server-side `createdAt`/`updatedAt` timestamps), not local filesystem paths — consistent with a standard multiplayer SaaS canvas rather than a local-file/offline-first tool.

**Offline story**: no offline mode is documented anywhere. The build log instead adds a fault-handling feature for disconnection: *"The editor will now show a warning when internet connection is lost"* (Oct 8, 2025 entry, [paper.design/build-log](https://paper.design/build-log)) — implying connectivity is assumed/required rather than offline being a supported mode. UNCONFIRMED beyond this inference (no explicit "Paper does not support offline use" statement was found).

**Multiplayer**: confirmed and actively developed, with a clear feature timeline from the build log:
- Real-time multiplayer cursors present at least by Dec 2025 (bug-fix log references "another user in multiplayer").
- **April 2026**: Teams feature — invite users with Editor or Admin access; documents shared outside the team default to view-only.
- **May 2026**: view-only mode with a banner, anonymous visitor support, "Prompted to switch teams," follow-a-teammate's-cursor, right-click cursor chat.
- **June 2026**: multiplayer cursor redesign for precision, and — notably — **"Teammate and agent presence in file"** (agents now show up in the multiplayer presence layer alongside humans).
(Source: [paper.design/build-log](https://paper.design/build-log).)

**Pricing (as of 2026-07-20, fetched directly from [paper.design/pricing](https://paper.design/pricing))**:

| Tier | Price | Key limits/features |
|---|---|---|
| Free | $0 | 100 MCP tool calls/week, limited image generation, 25 MB max image size |
| Pro | $20/mo, or $16/mo billed annually (20% savings) | 1,000,000 MCP tool calls/week, ~100× the image-gen volume of Free, video export, 100 MB max image size, priority feedback |
| Organizations | Custom (contact sales) | Everything in Pro + SAML/SSO, admin controls, custom contracts, dedicated support, priority onboarding |

(Note: one secondary review, [banani.co](https://www.banani.co/blog/paper-design-mcp-review) (Jul 19, 2026), states the annual Pro price as "$16/mo or $144/year" — the $144/yr figure is inconsistent with $16×12=$192/yr and with Paper's own pricing page; I'm treating the primary-sourced figures above as authoritative.)

**Export options**: PNG, JPG, WebP, AVIF, SVG, PDF (single node or `export_combined_pdf` for a multi-node/multi-page merged PDF), MP4 video (Pro-gated, configurable duration) — all via the `export` MCP tool (live schema) and confirmed in the build log (PDF export shipped May 2026, video export Oct 2025). Code export: JSX via `get_jsx` (Tailwind-class or inline-style format), plus in-app "Copy as React" / "Copy as Tailwind" hotkeys (⌥R / ⌥T, shipped Dec 2025), and raw computed CSS via `get_computed_styles`. Native Tailwind CSS *rendering* (not just export) is listed as "in progress" on the roadmap, done in partnership with the Tailwind team. No Figma-file, Sketch, or other design-tool interchange format export was found.

---

## 5. User sentiment

**Access limitations (reported transparently rather than papered over):** X/Twitter content could not be retrieved — `x.com/paper` returns either an empty client-side-rendered app shell (via direct fetch) or HTTP 402 Payment Required (via the WebFetch tool), consistent with X's API paywall for automated access. Reddit — including Paper's own official subreddit, [reddit.com/r/paperdesign](https://www.reddit.com/r/paperdesign/) — returned HTTP 403 to both the standard fetch tool and direct requests with a browser user-agent, and a browser-automation tool available in this environment (`aside`, which can use the user's logged-in sessions) failed with "Chrome extension not connected." Web search surfaced no indexed Reddit threads specifically discussing paper.design. This is a genuine gap, not a shortcut — the sentiment below is what could actually be sourced.

**Hacker News** (via HN's search API, all links verified): engagement is thin — no submission about Paper has cracked meaningfully past single digits of points:
- ["Figma but for AI Agents"](https://news.ycombinator.com/item?id=47435542) (Mar 19, 2026) — 4 points, no comments recorded.
- ["Paper – Design, Share, Ship"](https://news.ycombinator.com/item?id=46993065) (Feb 12, 2026) — 1 point, no comments recorded.
- ["Show HN: Paper's Heat Map Shader"](https://news.ycombinator.com/item?id=45185855) (Sep 9, 2025, posted by the team) — a few light positive comments: *"Really like the sepia filter when uploading logos, looks great!"* (user madou), *"Very cool stuff!"* (user big-nacho), and one limitation noted: *"Firefox is not supported at this time"* (user n3t).
- Two Feb 2025 Show HN posts about the standalone `liquid.paper.design` logo-effect tool ([#1](https://news.ycombinator.com/item?id=43106945), [#2](https://news.ycombinator.com/item?id=43118271)) — light engagement, mostly about the effect itself, not the core design tool.

**Product Hunt**: page exists at [producthunt.com/products/paper-5](https://www.producthunt.com/products/paper-5). Quoted praise found via search (originally about the logo/shader effect specifically): *"So fun, well done Paper team!"*, *"It's a pure Beauty!"*, *"This is super cool. It makes the logo look like it's moving."* — attribution/usernames not independently confirmed; treat as secondary-sourced.

**Independent reviews (dated, several with named/identifiable authors) — the clearest signal available**:
- Katharina Pilz, [bykatharina.com](https://www.bykatharina.com/blog/paper-design-vs-figma-two-different-bets-on-the-future-of-design) (Apr 7, 2026) — ran a hands-on "rebuild this homepage" test: Paper finished in 2m43s / ~5,800 tokens in a single pass (caught structural/decorative details, missed italic type variants); Figma took ~10 min / ~20,000 tokens with self-correction cycles. Concludes Paper is "still in open alpha" vs. Figma being "mature, polished, industry standard," and explicitly notes Paper has no prototyping capability against Figma's Figma Make.
- [uxpilot.ai/paper-design](https://uxpilot.ai/paper-design) — cons list: *"No interactive prototypes out of the box"*, setup friction (desktop app + local MCP config needed before AI features work), no built-in prompt-to-design, Free tier capped at 100 MCP calls/week.
- [sfailabs.com/guides/figma-mcp-vs-paper](https://sfailabs.com/guides/figma-mcp-vs-paper) (Mar 12, 2026) — praises the 24-tool bidirectional MCP vs. what it describes as "Figma's MCP beta ships 3 read-only tools" (this specific Figma comparison figure is this third party's claim, not independently verified by this research); concludes *"If you need production-ready stability today, Figma is the safer choice."*
- [launchberg.com](https://launchberg.com/paper-desktop-mcp-design-tool/) — calls Paper "usable but incomplete."

**Real, dated X reactions exist — but only the ones Paper itself embedded in its own blog post** about swarming Figma's Config conference with guerrilla marketing (newsstands, taxis, LED trucks) in June 2026 — [paper.design/blog/paper-at-config-part-1](https://paper.design/blog/paper-at-config-part-1) (Jul 1, 2026). These are about brand/marketing reception, not product features, but are genuine and attributable:
- Enzo Avigo [@0zne](https://x.com/0zne): *"@paper's truck doing laps around @figma Config might be the funniest thing you'll see today"* (Jun 25, 2026, 31 likes).
- Mayank Kinger [@kingermayank](https://x.com/kingermayank): *"@paper running the highest converting booth at config, and it's not even a booth. free coffee outside the check-in line."* (Jun 24, 2026, 28 likes).
- Jacob Miller [@pwnies](https://x.com/pwnies): *"Loving how brazen this is... Thank you for the coffee @stephenhaney"* (Jun 24, 2026, 23 likes).
- Danilo Leal [@danilobleal](https://x.com/danilobleal): *"the best new design canvas meets the best new ide :)"* (re: a Paper × Zed newsstand, Jun 23, 2026, 72 likes).
- 灰色ハイジ [@namika_haiji](https://x.com/namika_haiji): *"Paper had guerrilla ads all around Config 😂"* (Jun 24, 2026, 40 likes).

**Overall pattern**: enthusiasm concentrates on visual/shader craft, the code-fidelity of the HTML/CSS canvas, and MCP depth; every independent, dated review that discusses maturity explicitly flags **missing prototyping/interactivity** and general alpha-stage incompleteness (components, collaboration) as the main gap versus Figma. No direct, first-hand user complaint thread specifically about "static designs" could be located and verified given the X/Reddit access limitations above — this should be treated as an evidence gap, not as evidence of absence of such complaints.

---

## 6. Company basics

**Founders**: **Stephen Haney** — sole founder ("I'm starting Paper to help you design, share, and ship" — his own site, [stephenhaney.com](https://stephenhaney.com/)); previously co-founded **Modulz**, creator of Radix UI, which was **acquired by WorkOS in 2022**; also authored the book *Game Development with Swift* (2015). **Vlad Moroz** joined as **"the founding designer at Paper"** — his own words, dated Jul 7, 2026 — [paper.design/blog/design](https://paper.design/blog/design). **Ksenia Kondrashova** is an early team member associated with shader/motion-design work (X: [@uuuuuulala](https://x.com/uuuuuulala); active CodePen/Dribbble portfolio in generative/shader art) — her exact title is **UNCONFIRMED**: secondary sources variously describe her as "Design Engineer" or "head of product growth," and Grokipedia lists her as a co-founder, but no primary source confirms "co-founder" specifically. Other X-linked team members with unconfirmed roles: [@agusegui](https://x.com/agusegui) (likely "Agu," credited in the Config post for shirt design), [@hugosaintemarie](https://x.com/hugosaintemarie) ("Hugo," also credited in the Config post), [@douges](https://x.com/douges). Blog author "Dom Gordon" is also a team member (marketing/ops, per the Config post).

**Timeline**:
- Work began **~September 2024** (build log, Sep 9 2025: "almost exactly a year since we started working on Paper"; corroborated by Vlad's Jul 2026 post: "we started Paper not even two years ago").
- First public artifact: the standalone `liquid.paper.design` logo tool, Show-HN'd Feb 19–20, 2025.
- **Seed round: $4.2M, announced Feb 25, 2025**, led by **Accel and Basecase** — [paper.design/blog/seed](https://paper.design/blog/seed).
- **Open alpha sign-ups opened Sep 9, 2025** — [paper.design/build-log](https://paper.design/build-log).
- **Paper Desktop + MCP server launched March 2026**.
- Current desktop release: v0.5.0 (18 Jul 2026) — [paper.design/downloads](https://paper.design/downloads).

**Funding discrepancy worth flagging**: Tracxn's profile (data reflecting through ~mid-2026) lists only the single $4.2M seed round and no Series A — [tracxn.com](https://tracxn.com/d/companies/paper/__vqGscoBKDDGe9bFnza7EmZxL3eddImeiJHk-BvdGcv4). But Vlad Moroz's own Jul 7, 2026 hiring post names *"a top-tier group of investors behind us, such as Accel, Basecase, and **ICONIQ**"* — [paper.design/blog/design](https://paper.design/blog/design) — ICONIQ was not named in the original Feb 2025 seed announcement summary. **UNCONFIRMED** whether this reflects an unannounced follow-on round or simply an investor added to/omitted from the original seed. Grokipedia separately lists additional angels (Guillermo Rauch, David Hoang, Des Traynor, etc.) — that list comes from a secondary aggregator, not Paper's own post, and should be treated as less certain.

**Team size discrepancy**: Tracxn states 21 employees "as of June 30, 2026," while Vlad's post exactly one week later (Jul 7, 2026) says *"right now, it's just 12 of us"* and describes the team as fully remote across the Americas, Europe, and Australia — [paper.design/blog/design](https://paper.design/blog/design). Flagging both rather than resolving the conflict; the founder's own contemporaneous statement is likely more reliable for headcount.

**Traction/customers**: Paper names **Lovable, Quartr, Ramp, Resend, Vercel, Y Combinator, and Zed** as companies that use Paper in production and partnered with them on Config-conference marketing art — [paper.design/blog/paper-at-config-part-1](https://paper.design/blog/paper-at-config-part-1). Vlad's Jul 2026 post separately claims "growing revenue" and "an unusually strong fan base" without figures.

**Positioning vs. Figma**: Paper runs a dedicated comparison page, [paper.design/compare/figma](https://paper.design/compare/figma), contrasting: real HTML/CSS canvas vs. Figma's proprietary WebGL canvas; native CSS filters/effects/shaders vs. Figma's abstracted properties requiring translation; simultaneous sRGB+Display-P3 mixing vs. Figma's file-wide P3 toggle; and OKLCH/Oklab perceptually-uniform color vs. Figma's HSB/HSL picker. The homepage tagline is *"the connected canvas for teams shipping with agents."* Beyond the written comparison, Paper staged elaborate guerrilla marketing (branded taxis circling Moscone Center, LED trucks "doing laps around Figma Config") at Figma's own Config conference in San Francisco, June 2026 — [paper.design/blog/paper-at-config-part-1](https://paper.design/blog/paper-at-config-part-1) — a deliberate, publicly visible act of positioning itself as Figma's challenger. Independent reviewers largely frame Paper as best suited today for "designer-developer hybrids, solo founders, small teams building AI-first workflows," not yet as a full enterprise Figma replacement ([bykatharina.com](https://www.bykatharina.com/blog/paper-design-vs-figma-two-different-bets-on-the-future-of-design), [sfailabs.com](https://sfailabs.com/guides/figma-mcp-vs-paper)).
