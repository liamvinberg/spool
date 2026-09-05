# Paper: web layout, editable design nodes, and agent-mediated handoff

Research date: **2026-09-05**. Scope: the six investigation areas in [spool-cloud #58](https://github.com/liamvinberg/spool-cloud/issues/58). Sources combine Paper's guides, release notes, public plugin source and product disclosures with a local **Desktop 0.5.7 / MCP / Chrome** walkthrough. Desktop screenshots were blank; browser interactions and exported artifacts supplied the visual evidence. Background: [shared-library study](../shared-library-second-pass.md) and [properties mapping](../visual-properties-mapping.md).

**Paper makes web layout directly editable, but that does not establish that a Paper document is an executable application or the original application source.** The walkthrough confirmed token propagation and detachment, responsive reflow, and conversion of imported buttons/inputs into design frames. Export preserved visual styles but omitted the authored click handler. Collaboration has positive release evidence; the observed synchronization was between same-user sessions, not a multi-person test.

Status labels throughout: **Documented** means an operational guide, released-feature note, or first-party source states it; **Claimed** means first-party marketing, not verified behavior; **Inferred** means a deduction with stated premises; **Unverified** means the inspected sources do not settle it. **Observed** is reserved for the local walkthrough.

## Surfaces and product model

| Surface | What the evidence establishes | Boundary |
| --- | --- | --- |
| Paper Web | **Documented:** browser application at `app.paper.design`. | Browser access does not by itself establish offline persistence or multiplayer semantics. |
| Paper Desktop | **Documented:** downloads list **0.5.7**, dated `04-09-26`, with macOS ARM, Linux, and Windows packages. **Observed:** installed Mac version was 0.5.7. | Accessibility state and MCP worked; native screenshot capture remained blank. |
| Paper MCP | **Documented:** Desktop hosts the local agent interface; downloads label it 0.5.7 too. | Local transport does not mean design storage or AI processing stays local. |
| Paper Snapshot | **Documented:** separate browser extension capturing webpage content into editable layers. | Capture is a distinct import path, not proof of live source linkage. |

Sources: [Downloads](https://paper.design/downloads), [MCP overview](https://paper.design/docs/mcp). The Chrome Web Store lists Snapshot **0.3.8**, updated August 24, 2026, under Paper's corporate publisher, Lost Coast Labs. Its developer disclosure says the extension does not collect/use data; that claim applies to the extension and does not supersede the Paper service's privacy policy. [Snapshot listing](https://chromewebstore.google.com/detail/paper-snapshot/lidfahaahiogmnlccifabccgplofocck)

**Claimed:** Paper markets an HTML/CSS canvas with real flexbox, CSS effects, wide-gamut color and shader graphics. Its comparison language implies no translation. **Documented counterweight:** the import guides below explicitly describe translation. A shared rendering vocabulary can reduce mismatch without preserving application semantics. Paper's comparison pages are evidence of Paper's positioning, not reliable evidence about Figma or Pen. [Paper's Figma comparison](https://paper.design/compare/figma)

## 1. Project lifecycle and navigation

**Documented interaction vocabulary:** `F` creates a frame; `Shift+F` wraps a selection; `Shift+A` wraps in flex; `T` adds text. `Enter` descends or enters text/path editing; `Escape` ascends. `Cmd+click` selects deeply, and `Cmd+right-click` exposes the overlapping hierarchy. `Tab` cycles siblings; `Cmd+R` renames. Selection zoom is `Shift+2`, whole-canvas fit is `Shift+1`. [Support, creation/selection/zoom](https://paper.design/docs/support)

**Documented release inventory:** dashboard search, folders/subfolders, reorderable pages, duplication, desktop tabs, and background-file agent work have shipped. Undo/redo and disconnection behavior receive fixes, but those notes do not define recovery guarantees. [Build log, March through August 2026](https://paper.design/build-log)

**Unverified:** native on-disk document format, automatic save durability, cross-device reopening, deleted-file recovery, named version history, conflict resolution, and editing after a cold offline start. A visible file in the dashboard or a successful undo does not answer these questions. Do not confuse the MCP guide's Git tutorial for a generated website with version history for the Paper design file.

**Observed:** MCP created/opened a scratch file in a background desktop tab; Chrome displayed the same content. Browser reload preserved edited content, sizing, tokens and selection, while returning the left panel from Theme to Design. Text and an accidental resize were successfully undone. A menu exposed Duplicate file, deep selection, nudge settings and multiplayer cursors. This does not establish undo retention across reload, offline recovery or another device's behavior. [Walkthrough](#hands-on-evidence)

## 2. Visual editing and layout

**Documented:** the changelog records padding/gap handles, constraints, flex wrapping, image fills, text wrapping/truncation controls, selection colors, and an **Other styles** panel for agent styles not yet exposed as editable properties. [Build log, November 2025 through August 2026](https://paper.design/build-log)

**Documented:** arrow nudges default to one pixel; Shift uses a configurable larger increment, initially eight. Keyboard operations include resize, fit/fill sizing, typography adjustment, pixel snapping, and measurement display. These establish alternative input routes, not complete keyboard or screen-reader accessibility. [Support, arranging/styling/view aids](https://paper.design/docs/support)

**Claimed:** per-element mixed color spaces, OKLCH/OKLab, CSS filters, outlines, shadows, and shaders are major differentiators. Test the ordinary property panel separately from the shader-specific inspector. [Paper's own feature comparison](https://paper.design/compare/figma)

**Documented vector workflow:** paste SVG; select an internal layer; change geometry, fill or stroke; enter path editing with `Enter` or double-click; manipulate points or draw with `P`; leave with `Escape`. New paths may create their own SVG container. Enabled pixel snapping quantizes path points to half-pixels. The same guide has an older introductory claim that creation from scratch is forthcoming, contradicted by its detailed instructions. Prefer the concrete path instructions, and record local behavior. [Vector editing](https://paper.design/docs/svg)

**Unverified:** which property sections are conditional; search within properties; mixed-value presentation; min/max UI; width/height unit support; margins versus gap; drag snapping to tokens rather than pixels; modifier behavior on padding handles; breakpoint-specific visual editing; image crop/fit controls on ordinary frames; and full keyboard accessibility. A CSS value imported through MCP is not proof that a human can edit it through a discoverable control.

**Observed:** selecting the responsive card exposed Layout/Flex, horizontal/vertical padding, radius, blending and fill, with additional effect sections below. A longer inline text edit wrapped; the selected parent showed width 100% and height Fit, measured **358 × Fit 248**. Numeric padding edits worked. An attempted padding drag instead resized the frame; undo restored Fit. Direct padding-handle use therefore remains unverified. [Text and inspector](evidence/paper-02-text-wrap.png), [gesture account](#hands-on-evidence)

## 3. Reuse and design systems

**Documented:** Theme stores CSS-variable tokens for color, radius, spacing, container, breakpoint and typography. Bind through property dropdowns; color has a dedicated token picker. Editing a token updates its uses. Detachment keeps the resolved value while removing the binding. Create/edit tokens in Theme; closing the editor saves them. Copy tokens between files or into CSS, but copied tokens do **not** remain linked across files. Libraries remain work in progress; multi-mode themes and bundled reusable style classes are roadmap items. [Tokens guide](https://paper.design/docs/tokens)

**Observed workflow:** spacing began at 16; the browser picker offered Detach. Detaching horizontal card padding and entering 20 produced `paddingInline: '20px'`. MCP changed the token to 24; a subsequent browser Theme edit to 32 updated bound gap/vertical padding and reflowed the card, while horizontal padding stayed 20. Cross-file token copying was not tested. [Picker](evidence/paper-03-token-picker.png), [before](evidence/paper-04-theme-and-detached-padding.png), [after](evidence/paper-05-token-propagation.png), [final tokens](evidence/paper-tokens.css.txt)

**Documented roadmap:** code-component use is in progress; components with props/slots and component kits are forthcoming. CSS Grid is planned, while broader native Tailwind integration remains in progress. These statuses must not be confused with existing Tailwind export or imported visual copies. [Roadmap, production/pro-tool sections](https://paper.design/roadmap)

**Documented import constraint:** Figma components, instances and variables detach on paste, and code-connected components are unsupported. Image import needs an optional Figma connection whose account can access the source file; API limits may intervene. Masks and some effects/text semantics also lose fidelity. [Figma paste, components/variables/images/translation](https://paper.design/docs/paste/figma)

**Inferred:** a populated Theme panel is evidence of a token dictionary, not a published component library. A repeated button rendered as layers, a cloned node, a sticker sheet, a token binding, and an instance that propagates structural changes are five different claims. The current docs support some of these and explicitly defer others.

**Observed:** MCP duplication produced an independent button clone. Changing the original's horizontal padding from 16 to 24 left its clone at 16; both retained the accent-color variable. This tests duplication, not a native component-instance feature. The user's existing Spool Theme contained 35 tokens across three pages; that inventory was inspected without changing the document. [Exported two-button structure](evidence/paper-export.jsx.txt)

**Unverified:** token aliases/chains, cycles, per-subtree scopes, binding reach inspection, usage navigation, imported Tailwind namespace mapping, and any newer component-instance interface absent from these guides. Specifically test whether a reused button has a definition, override metadata, navigation back to its use, and structural propagation. Do not infer missing support merely from not finding a menu.

## 4. Runtime and interactivity

| Capability | Evidence and interpretation |
| --- | --- |
| Browser layout | **Observed:** flex layout and wrapping reflowed after artboard width and token changes. This establishes responsive layout in the fixture, not arbitrary application execution. |
| Imported form controls | **Documented and observed:** the input probe became nested Frames/Text; JSX exported no input. A button with an authored click handler became Frame/Text, with no handler in exported JSX. |
| Imported styling and structure | **Documented:** inline CSS only; class names and selector-based styling are discarded. Paper applies border-box, transforms inline/text structure, and strips irrelevant styles. |
| Animated visual effects | **Documented:** Paper Shaders has executable React packages with animation parameters; for example Heatmap uses a speed parameter and image input. That is concrete animated output, not proof of a user-authored app runtime within the design canvas. |
| Live content | **Documented:** the MCP guide uses an external agent to copy Notion records into selected design content. This shows data-informed authoring, not a continuously subscribed data binding. |
| Functional website | **Documented:** the guide has an agent generate a separate project, run its development server, refine responsive behavior and deploy elsewhere. The website runtime is outside Paper. |
| Click-through prototype, persistent state, router, arbitrary JS, live forms, fetch from authored canvas code | **Unverified:** no inspected operational guide establishes these. HTML rendering alone cannot settle them. |

Sources: [HTML import translation](https://paper.design/docs/paste/html), [Heatmap executable example](https://shaders.paper.design/heatmap), [MCP, Notion and website tutorials](https://paper.design/docs/mcp), [observed JSX](evidence/paper-export.jsx.txt), [reflow](evidence/paper-05-token-propagation.png).

**Documented future work:** a script/prompt engine, third-party animation embeds, and Three.js islands remain planned. **Inferred:** calling the entire product “static” would obscure its shaders and real layout; calling every Paper design “the live app” would obscure the input translation and external build workflow. [Roadmap, connected tool/canvas sections](https://paper.design/roadmap)

The completed probe establishes **input and click-handler translation for the tested MCP HTML import**. A separate presentation-mode link/counter test, router, network fetch and arbitrary code execution remain unverified. Do not extend the result to every possible Paper import or preview path.

## 5. Code, agents, imports and ownership

**Documented:** Desktop exposes `http://127.0.0.1:29979/mcp`. The reference includes structural reads, screenshots, computed styles and JSX output; writes include artboards, HTML insertion/replacement, text/styles, cloning, moving and deleting nodes. It is an editing API, not merely a screenshot exporter. [MCP, connection/reference](https://paper.design/docs/mcp)

**Documented at source:** the public plugin describes code-to-design as using repository styles/tokens/components as context to **generate** canvas content. Design-to-code reads the selected frame and generates components according to repository conventions. Its Figma example creates a design-system sticker sheet. Those are agent-mediated operations, not a documented continuous synchronizer preserving source identifiers. [Plugin README, revision f6d4f133](https://github.com/paper-design/agent-plugins/blob/f6d4f13343dd924fabaadd0898725f1b8718459d/plugins/paper-desktop/README.md)

**Claimed:** the homepage describes agents synchronizing tokens, styles and components in a continuous loop and moving real content between canvas and repository. **Inferred:** the agent is the bridge in that claim. The published material does not guarantee lossless bidirectional AST edits, automatic file watching, stable source maps, or conflict resolution when code and design change simultaneously. [Homepage, design-to-code/content sections](https://paper.design/)

**Documented HTML boundary:** `<x-paper-clone node-id="…">` copies an existing design node. It does not establish an instance relationship. Images in HTML `<img>` and background styles are uploaded to Paper and require reachable public URLs for this import route. [HTML paste](https://paper.design/docs/paste/html)

**Documented Snapshot workflow:** activate the extension, select a webpage element, refine with arrow keys, capture, then paste into Desktop or Web. **Unverified:** preservation of event handlers, application state, repository identity or a live refresh relationship after capture. [Snapshot quick start](https://paper.design/snapshot-extension)

**Documented local-image distinction:** Snapshot's local-server guide specifies CORS access from `https://app.paper.design`; it provides framework-specific configurations. This is contrary evidence to a blanket “local images never work” conclusion drawn from the generic HTML-paste warning. The two capture paths must be tested separately. The guide does not establish whether image copies persist only locally. [Snapshot with local images](https://paper.design/docs/support/snapshot-local-images)

**Observed:** agent-authored HTML appeared as editable browser layers; browser changes to text/padding were readable through MCP and exported JSX. A local `paper-asset` image reference became a cloud `file-assets` URL. [Export](evidence/paper-export.jsx.txt), [synthetic image](evidence/sample.png). This is an author/edit/export loop, not a verified production-repository round trip. Automatic source refresh, source identity preservation and application of the export back to an existing repository were not tested.

**Unverified:** the native document schema, script sanitization details, per-tool transaction/undo grouping, idempotency, mutation atomicity, and rollback after partial multi-tool failure. Use a scratch file to test interrupted writes. Published guides do not supply those contracts.

## 6. Collaboration, storage and delivery

| Concern | Evidence |
| --- | --- |
| Cloud storage/processing | **Documented:** Paper identifies MongoDB as its primary application database; Cloudflare provides object storage and compute; Fly.io hosts application compute; Redis supplies cache/pub-sub. This confirms service infrastructure, not the exact authoritative-save protocol. |
| Authentication | **Documented:** WorkOS provides authentication, SSO and session management. |
| AI processing | **Documented:** Paper lists Anthropic, OpenAI, Gemini and Replicate as AI subprocessors. Its policy separately discusses third-party agents interacting with design files. A local MCP endpoint does not limit where an external agent sends retrieved content. |
| Local storage | **Unverified:** whether the complete design is recoverably stored locally. The privacy policy mentions local-storage technologies in service operation, which is insufficient evidence of an offline document store. |
| Sync | **Observed:** Desktop MCP writes appeared in the browser; browser edits were readable through MCP and survived browser reload. **Unverified:** transport, merge policy, reconnect queue, save acknowledgment and retention. These were same-user sessions, not a multi-person conflict test. |

Sources: [Subprocessors, March 23, 2026](https://paper.design/legal/subprocessors), [Privacy policy, March 30, 2026](https://paper.design/legal/privacy). These are product disclosures, not a network trace or a security audit.

**Documented collaboration:** release notes independently establish team editor/admin access, external view-only sharing, anonymous viewing, teammate-following, presence and comments. August comments can be resolved, searched, filtered and sorted. Free viewers have team-file access without editing. Do not extrapolate these notes into per-file permission granularity. [Build log, April–August 2026](https://paper.design/build-log)

**Claimed:** the comparison page describes real-time multiplayer through shared URLs. This agrees directionally with the release notes; concurrency, comment notifications, permissions and reconnect behavior remain separate tests. [Paper's Pencil comparison](https://paper.design/compare/pencil)

**Documented pricing on the research date:** Free has unlimited editors/viewers, 100 MCP calls per week, limited generation and 25 MB images. Pro lists $20/editor/month, or $16 with annual billing, one million weekly MCP calls, increased generation, video export and 100 MB images. Viewers remain free; upgrading makes editor seats paid. Organizations is contact-sales with SSO/admin/custom-contract offerings. Record the installed account's actual plan before treating a blocked action as absent functionality. [Pricing](https://paper.design/pricing)

**Documented delivery:** selection exports include React CSS/Tailwind, images and paid video; release notes add combined multi-frame PDFs. [Support, export](https://paper.design/docs/support), [Build log, May 2026](https://paper.design/build-log). **Unverified:** complete editable archival export/reimport, comments/history portability, self-hosting, or a runnable hosted application published directly from the design document.

## Source contradictions and freshness

Do not resolve these by promoting every roadmap item to shipped status:

- **Current-file versus multi-file MCP:** support still describes the current file, while August release notes add background-tab operations. **Observed:** scratch work used a background file, and explicit `fileId` access still read the original Spool document afterward. The installed behavior supports the newer release notes. [Support](https://paper.design/docs/support), [Build log](https://paper.design/build-log)
- **Theme versus library:** token documentation is specific about current functionality; the broad roadmap is less granular. Copied tokens are not synchronized libraries. [Tokens](https://paper.design/docs/tokens), [Roadmap](https://paper.design/roadmap)
- **Component language:** pasted Figma slots in the release notes are not proof of a native reusable component system. The import guide still says components detach. [Build log](https://paper.design/build-log), [Figma paste](https://paper.design/docs/paste/figma)
- **Translation claims:** HTML and Figma import guides document transformations despite marketing suggesting none. Preserve this distinction in comparisons. [HTML paste](https://paper.design/docs/paste/html), [Figma comparison](https://paper.design/compare/figma)
- **Vector creation:** the vector guide's introductory roadmap lags its own new-path instructions. [Vector guide](https://paper.design/docs/svg)

## Hands-on evidence

The coordinating agent conducted these local observations on September 5 using **Paper Desktop 0.5.7**, its MCP server, native accessibility inspection and Chrome computer use. The documentation researcher subsequently inspected the saved screenshots/exports and integrated that account. No independent human participant took part; this is an evaluator walkthrough, not user research.

### Setup and preserved work

The pre-existing Spool file had three pages and a Theme inventory of 35 tokens. Its token fingerprint remained `a32d9875` before and after scratch work. The session created [Competitor study 2026-09-05](https://app.paper.design/file/01M1REZ9JVNPPED2C43HH299MH) through MCP `create_file`/`open_file`; it opened in a background desktop tab. Explicit background `fileId` reads remained available. The account plan was not recorded; the tested edits/import/export succeeded without a plan-gate error.

Native accessibility actions worked, but screenshots stayed blank after selecting the scratch tab, reload and Raise. The same file was visible in Chrome and reflected MCP changes. This is a **desktop capture limitation in this session**; its cause is unknown. No AeroSpace diagnosis follows from it. Browser images below are successful browser observations, not native desktop screenshots.

### Representative workflow and results

1. **Create the fixture through MCP.** A 390 × 600 Reading list artboard used a flex column, 16-pixel spacing token, responsive card, synthetic checkerboard image, Inter text at 24/16 pixels and a Save button with an authored label-changing `onclick`. Browser rendering displayed the structure and image. [Initial fixture](evidence/paper-01-fixture.png)
2. **Edit text through the browser.** Double-clicking the text, then Enter, entered inline editing. The first automated `typeText` attempt cleared the label without inserting its replacement. Undo restored it; a paste retry successfully inserted the full longer sentence. It wrapped and grew the Fit-height parent. This records both the successful path and automation friction, without diagnosing a general text-editor failure. [Wrapped label](evidence/paper-02-text-wrap.png)
3. **Attempt direct padding adjustment.** Clicking an apparent lower padding mark did nothing. Dragging changed frame height from Fit to 268 rather than padding. Undo restored the prior sizing. The selected mark was not established as the intended padding control, so the dedicated gesture remains unverified rather than unsupported.
4. **Detach and edit one dimension.** Open the horizontal padding token dropdown, choose Detach, and enter 20. The exported property became a literal while the card's vertical padding and gap retained their token bindings. [Token picker](evidence/paper-03-token-picker.png), [JSX](evidence/paper-export.jsx.txt)
5. **Exercise responsiveness and propagation.** MCP narrowed the artboard to 320 and changed spacing 16 → 24. Browser Theme then changed 24 → 32. The card changed from 272 × Fit 300 to 256 × Fit 332, with altered wrapping; detached horizontal padding stayed 20. [At 24](evidence/paper-04-theme-and-detached-padding.png), [at 32](evidence/paper-05-token-propagation.png)
6. **Probe reuse and runtime semantics.** MCP duplicated Save, then changed only the original's horizontal padding to 24; the duplicate kept 16. Imported `<input value="Type here">` became Frames/Text. The resulting JSX contains visual `div` structure, no input and no click handler. These observations constrain the tested importer and duplicate operation; they do not prove all interaction/component features absent. [Final export](evidence/paper-export.jsx.txt)
7. **Check persistence and finish.** Browser reload preserved the edited values, content and selection; Theme returned to Design. The existing Spool token fingerprint was unchanged afterward, and the agent called `finish_working_on_nodes`. Sharing remained unchanged, no comments were sent and nobody was invited.

### Saved evidence

| Artifact | What it shows |
| --- | --- |
| [paper-01-fixture.png](evidence/paper-01-fixture.png) | Initial 390-pixel artboard with short title, checkerboard image and Save control. |
| [paper-02-text-wrap.png](evidence/paper-02-text-wrap.png) | Long text wraps; selected responsive card shows width 100%, height Fit, and 358 × Fit 248. |
| [paper-03-token-picker.png](evidence/paper-03-token-picker.png) | Horizontal padding dropdown offers Detach and the bound card token at 16. |
| [paper-04-theme-and-detached-padding.png](evidence/paper-04-theme-and-detached-padding.png) | At token 24, horizontal padding is 20 while vertical padding/gap are 24; duplicate button and input-shaped frame appear below. |
| [paper-05-token-propagation.png](evidence/paper-05-token-propagation.png) | Theme token 32 propagates to bound properties; horizontal padding remains 20 and card height reflows to Fit 332. |
| [paper-export.jsx](evidence/paper-export.jsx.txt) | Final visual structure, literal versus token styles, independent duplicate spacing and hosted image URL. |
| [paper-tokens.css](evidence/paper-tokens.css.txt) | Final accent-color and 32-pixel spacing definitions. |
| [sample.png](evidence/sample.png) | Synthetic image used across the study. |

Remaining observation gaps: multi-person editing/conflicts, comments, offline recovery, permissions, native component-instance navigation, cross-file token copies, full repo round trips, and successful direct-padding manipulation. Native screenshot capture also remains unresolved. The session did not alter network settings or private sharing merely to exercise these cases.

## What this evidence contributes to Spool

**Inferred precedents, not implementation recommendations:**

1. CSS-based rendering and visual editing can coexist with a selective inspector. The existence of Other styles is useful evidence that exposed controls and supported styles need not be identical.
2. Token editing, structural reuse and source ownership deserve separate evaluation. A Theme panel cannot answer whether a shared React definition is edited safely.
3. Import and export can be valuable without automatic synchronization. Future comparisons should describe the actual number and kind of handoff steps, rather than promise a generic round trip.
4. Rendering, animated graphics, agent-populated data and executable user flows form separate capabilities. The imported-input test gives a specific boundary worth preserving in the cross-product matrix.
5. Paper has documented collaborative features; cloud infrastructure alone was never sufficient evidence. Persistence, recovery and permission scope still require their own observations.

These findings broaden the earlier [properties and library research](../shared-library-second-pass.md). They do not choose Spool's interface, prescribe a library subsystem, or establish user preference from one evaluator's walkthrough.
