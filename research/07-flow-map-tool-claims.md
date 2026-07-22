> Research asset for issue #34 ("the flow map is read, not walked"), gathered 2026-07-23. Historical evidence: verification of the tool-survey claims the ticket leaned on, checked against primary sources (official help centers, product docs, product pages, Internet Archive). Facts only; UNCONFIRMED marks preserved.

# Verification: the tool-survey claims behind #34

*Research as of 2026-07-23. Four claims, each traced back to the source that owns it. Verdict per claim: confirmed / refuted / nuanced. All quotes are verbatim from the cited page as fetched on 2026-07-23. Where a source was unreachable or version-dependent, that is stated inline.*

## 1. Figma: hotspot hints + connection-wire visibility

**What #34 borrowed:** the player hint toggle (highlight every navigating element on demand) and hideable canvas arrows (decision 7 and decision 8).

**Hotspot hints in presentation view: confirmed.** Figma's own help center, [Play your prototypes](https://help.figma.com/hc/en-us/articles/360040318013-Play-your-prototypes): "Hotspot hints help guide users through a prototype. They show where the Hotspots are in the prototype," and when a user clicks outside of a hotspot, Figma "highlight[s] any clickable areas with a blue bounding box." The control is a setting named **"Show hints on click"** in the presentation view options menu (alongside Enable Figma shortcuts, Make available offline, Accessibility settings, Hide UI, and scaling options).

**The "always show them" variant: not found.** The only documented mode is click-triggered. Neither the presentation-view options list nor the embed parameter describes a persistent always-on hint overlay. #34's decision 8 (a toggle that persistently highlights every navigating element) goes further than what Figma ships; Figma's hints are a transient flash on misclick, gated by an on/off setting.

**Hints are also an embed-level visibility control: confirmed.** Figma's developer docs, [Embed a Figma prototype](https://developers.figma.com/docs/embeds/embed-figma-prototype/), officially document the URL parameter **`hotspot-hints` (default: true)**: "When true, clickable areas of the prototype are highlighted when the user clicks." The same page documents `show-proto-sidebar` (default false), `viewport-controls`, `disable-default-keyboard-nav`, `device-frame`, `footer`, `scaling`, and `content-scaling`. Note the parameters live only in the developer docs; the help-center article [Embed files and prototypes](https://help.figma.com/hc/en-us/articles/360039827134-Embed-files-and-prototypes) lists no parameters and defers to the developer documentation.

**Connection-wire visibility in the editor: confirmed.** Help center, [View prototype connections](https://help.figma.com/hc/en-us/articles/4411431245335-View-prototype-connections):

- "Prototype connections are hidden by default for anyone with view access."
- "Use the shortcut ⇧ Shift E to toggle the visibility of any prototype connections."
- "You can also toggle prototype connections from the toolbar. Select view settings (current zoom percentage) and toggle **Prototyping** off or on."
- With nothing selected, the Properties panel lists the page's Flows, each with a visibility toggle, jump-to-starting-frame, copy link, and inline preview.
- For edit access, connections render while the Prototype tab is open in the right sidebar (⇧E opens it).

So Figma treats the wires as an overlay you can switch off from the view-settings menu or by shortcut, which is exactly the pattern decision 7 borrows (toolbar toggle + key, arrows default on). Plan-dependence: none stated in any cited article; the visibility toggles are available to view-access seats, and `hotspot-hints` is not plan-gated in the embed docs.

**Verdict: confirmed** (with the one correction above: no always-on hint setting exists in Figma; the hint affordance is click-triggered).

## 2. ProtoPie: no flow map at all

**What #34 borrowed:** proof that a shipping, mature prototyping tool needs no canvas wires at all, which licenses spool's arrows-off mode (decision 7's toggle) without breaking the product.

**No canvas of wired scenes: confirmed, in ProtoPie's own words.** The scenes doc, [How to use Scenes](https://www.protopie.io/learn/docs/basic-features/scenes), states directly: **"ProtoPie's scenes are not displayed side-by-side as in most design tools."** Scenes open one at a time from the Scenes Panel. The interface doc, [Understanding the ProtoPie Interface](https://www.protopie.io/learn/docs/introducing-protopie/understanding-the-interface), describes the canvas as "the container for your active scene and its layers" and the Scene Panel (hidden by default) as "an organized view of all the scenes created within your prototype," a reorderable list. No panel in the documented interface shows multiple scenes with connections between them.

**Navigation lives in per-scene triggers: confirmed.** [How to use Responses](https://www.protopie.io/learn/docs/interactions/responses): **Jump** is "Going from one scene to another scene" (with Smart Jump auto-animating matched layers); **Link** is "Opening websites or apps through URL schemes." Both are responses attached to triggers inside a scene, configured in the interaction panel's list. There is no canvas-level wire object anywhere in the model. (#34's framing "jump responses" matches the docs' actual term.)

**Nuances found (none of them a flow map):**

- ProtoPie still ships a hint affordance without any map: shared prototypes have a viewer display setting **"Hotspot Hints: Highlight touchable areas for easier navigation"** ([Sharing Prototypes](https://www.protopie.io/learn/docs/cloud-sharing-prototypes), gear-icon options alongside device frame, cursor type, background, playback speed). Same pattern as #34's player hint toggle, and evidence the hint idea is not Figma-specific.
- **"Interaction recordings"** exist but are handoff artifacts, not an overview: "Click on the **Handoff** button to create interaction recordings that engineers can easily follow and reference during their work" (same sharing doc). They record interactions for spec reading; they do not draw scene-to-scene structure.
- Per-scene share links exist ("Generate dedicated links for each scene"), which is addressing (deep links), not mapping.
- A user feature request titled "Visual feedback of scenes flow" was indexed on ProtoPie's Canny feature-request board (protopie.canny.io), corroborating that users notice the absence; the board itself now returns "Company Not Found" (checked 2026-07-23), so the request's content and status are UNCONFIRMED.
- Coverage caveat: ProtoPie's changelog page ([Releases](https://www.protopie.io/support/releases)) renders client-side and could not be scanned in full from here. The recent first-party release announcements that were checkable (ProtoPie AI open beta and Basic-plan Team Spaces, both 2026-02-09, per [the ProtoPie blog](https://www.protopie.io/blog/protopie-ai-beta-launch)) contain nothing flow-map-shaped, and the current docs contain no such feature. Absence is asserted from docs plus search, not from an exhaustive changelog read.

**Verdict: confirmed.**

## 3. Rive and Origami: logic in a dedicated graph, not on the drawing canvas

**What #34 borrowed:** the negative example. Both tools quarantine flow/logic into a separate graph surface; spool instead derives arrows from source and draws them on the one canvas. The claim to verify is only the factual half: that their graphs are dedicated editors separate from the artboard canvas.

**Rive: confirmed.** [State Machine](https://rive.app/docs/editor/state-machine/state-machine) in Rive's editor docs: **"The Graph is the space in which you'll be adding States and connecting Transitions. It appears in place of the Timeline when a state machine is selected in the animations list."** States are timeline animations wired by dragged transitions, with conditions and properties per transition. The graph is a contextual surface occupying the timeline strip, distinct from the artboard stage where artwork lives (artboards "act as the root of every hierarchy," [Artboards](https://rive.app/docs/editor/fundamentals/artboards)). Nothing in the state-machine docs draws logic on the artboard itself.

**Origami Studio: confirmed.** The docs front page, [origami.design/documentation](https://origami.design/documentation/), tours the interface as separate panels: the **Canvas** ("Visually drag, drop and resize to layout your prototype. Draw and edit shape layers, text, images, videos"), the **Patch Editor** ("Add interaction, animation, and behavior to your prototype using blocks called patches. Connect patch outputs to layer properties"), plus Layer List, Inspector, Viewer, and Patch Library. Patches and cables live entirely in the Patch Editor pane ([Patches](https://origami.design/documentation/patch-editor/patches)); the canvas holds layers. Interaction structure is never drawn between artboards on the canvas; it is dataflow wiring in the dedicated graph pane. (Origami remains actively maintained; releases were current as of July 2026, see report 02 §5.)

**Verdict: confirmed.**

## 4. Overflow: element-anchored flow arrows, and the alleged sunset

**What #34 borrowed:** decision 5, arrows grow out of the element that causes navigation (element-anchored tails), with frame-edge fallback.

**Element-anchored connectors: confirmed.** Overflow's own features page, [overflow.io/features](https://overflow.io/features/):

- **"Drag connectors from any layer on your artboard."** Connectors start at a specific layer, not at the frame edge.
- For flat imports: "Mark interaction areas on imported screenshots by drawing hotspots and apply connectors to other screens." Hotspots substitute for layers when there is no layer structure to anchor to.
- Connectors are editable in "colors, starting and ending points, labels, and more."
- "Prototyping links added in your design tool can optionally be transferred into Overflow as connectors," i.e. the anchor is the design-tool hotspot that triggered navigation.
- In presentation: "Easily navigate between screens by clicking on interactive areas and connectors or by using the handy keyboard shortcuts."

This is exactly the pattern #34's element-anchored tails follow (arrow tail = triggering element; spool adds the frame-edge fallback for unlocatable elements).

**The reported sunset: refuted.** No first-party shutdown announcement exists, and the product is live and selling as of 2026-07-23:

- [overflow.io](https://overflow.io/) serves its normal marketing site ("Create interactive user flows, stunning design presentations, and step-by-step walkthroughs..."), no banner, no farewell notice.
- [overflow.io/pricing](https://overflow.io/pricing/) actively sells: Pro at €19.95 per user/month, Enterprise custom, 14-day free trial with no credit card.
- [overflow.io/blog](https://overflow.io/blog/) contains no goodbye post.
- Web searches for a shutdown/sunset/goodbye announcement (including via vendor PROTOIO Inc) return nothing, first-party or third-party.
- Internet Archive cross-check: the CDX index shows overflow.io returning HTTP 200 in monthly snapshots continuously through 2026, most recently [the 2026-07-06 snapshot](http://web.archive.org/web/20260706201609/https://overflow.io/) (timestamp 20260706201609), whose page title is the standard "User flow diagramming tool for design teams | Overflow" and which contains no shutdown language.

**Dormancy nuance (kept separate from the sunset question):** the visible content pipeline looks stalled. Blog posts show month/day with no year, and the newest post's case-study content describes events of mid-2023 (a designer joining "around June 2023"), implying the blog has been quiet since roughly September 2023; exact year UNCONFIRMED because the site omits years. The support center root (support.overflow.io) returned HTTP 403 to this fetcher, likely bot protection, since its articles (e.g. [Overflow 2.0 overview](https://support.overflow.io/hc/en-us/articles/4415736629138-Overflow-2-0-overview)) remain indexed and linked. So: not sunset, still sold, but "actively developed" is unproven in either direction. Wherever the "reportedly sunset" impression came from, it was not something Overflow published.

**Verdict: nuanced.** The element-anchoring half is confirmed from Overflow's own feature copy. The sunset half is refuted: no shutdown announcement exists and the product is live as of 2026-07-23, though with dormancy signals around its public content since ~2023.

---

## Summary table

| # | Claim | Verdict |
|---|---|---|
| 1 | Figma hotspot hints + hideable connection wires | Confirmed (no always-on hint mode exists; hints are click-triggered, plus `hotspot-hints` embed param) |
| 2 | ProtoPie ships with no flow map; navigation is per-scene Jump responses | Confirmed ("scenes are not displayed side-by-side," in their own docs) |
| 3 | Rive and Origami put logic in a dedicated graph editor separate from the artboard canvas | Confirmed (Rive: graph replaces the Timeline; Origami: Patch Editor is a separate panel from the Canvas) |
| 4 | Overflow anchors connectors to the triggering element; product reportedly sunset | Nuanced (anchoring confirmed; sunset refuted, product live 2026-07-23 with dormancy signals) |
