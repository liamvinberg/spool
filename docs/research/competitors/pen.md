# pen.dev, formerly Pencil

Research date: **2026-09-05**. Scope: [spool-cloud #58](https://github.com/liamvinberg/spool-cloud/issues/58), building on [earlier research](../shared-library-second-pass.md). The coordinating investigator performed the walkthrough; the documentation investigator inspected its screenshots and HTML export.

**The documented product is a local design document editor with agent-driven translation to application code, plus a constrained executable graphics surface.** Script execution does not establish React applications or network-backed forms. Local storage also coexists with remote authentication, AI processing, and analytics.

**Documented** means a published first-party contract, not verified operation. **Observed** identifies local evidence. **Inferred** marks interpretation. **Unverified** means unresolved, not unsupported. Marketing claims are identified separately.

## Identity, freshness, and surfaces

**Observed, HTTP retrieval:** `https://pencil.dev`, `https://www.pencil.dev`, and `https://pen.dev` resolved to `https://www.pen.dev/` on the research date. `https://docs.pencil.dev` still responded on that hostname with pen.dev-branded documentation; `https://docs.pen.dev/` is available. The [homepage](https://www.pen.dev/) explicitly announces the name change. 

**Documented:** desktop, VS Code, and Cursor are supported surfaces. Installation instructions describe a local MCP server starting with the app. These instructions still frame Claude Code installation and authentication as required for AI. [Installation, Desktop Application and MCP Server](https://docs.pen.dev/getting-started/installation#desktop-application)

**Documented:** a separate `@pen.dev/cli` runs the editor engine headlessly; app mode connects to an existing editor over WebSocket. It supports prompt execution, direct tool calls, batch tasks, and export. Agent operations require account authentication or an organization-scoped CLI key. [CLI, introduction, Authentication, Interactive Mode](https://docs.pen.dev/for-developers/pen-cli)

Most examined documentation pages display **August 26, 2026**. Privacy policy: **August 10**. EULA: **August 14**. Sub-processors: **August 31**. The contradictions below limit reliance on those dates.

## 1. Project lifecycle and navigation

**Documented workflow:** create a `.pen` file in an IDE, or use File → New / Cmd+N in desktop; keep it alongside application files; save with Cmd+S; reopen through the editor or file association. The file guide calls the format readable JSON and recommends Git history. It explicitly says auto-save is unavailable. [.pen Files](https://docs.pen.dev/core-concepts/pen-files)

**Documented:** an infinite canvas holds frames; the left Layers panel exposes hierarchy and renaming. Click selects, Cmd+Click directly selects the deepest element, and Shift+Click adds selection. Space-drag pans; `0` restores 100%; `1` fits everything. The right Properties panel appears with selection. Regular elements, component origins, and instances have different selection colors. Desktop embeds chat; IDE users use IDE chat; selected objects enter agent context. [Interface, Infinite Canvas through AI Chat](https://docs.pen.dev/core-concepts/pencil-interface)

**Documented:** Delete removes selection; arrows nudge 1px and Shift-arrows 10px, while arrows reorder flex children. Shift+A adds flex layout; Cmd+Option+G wraps a frame. This matters because the interface overview assigns the latter shortcut to applying flex layout, a conflicting description. [Keyboard Shortcuts, Editing](https://docs.pen.dev/core-concepts/keyboard-shortcuts#editing)

**Documented constraint:** troubleshooting acknowledges limited undo/redo and recommends incremental saves and Git recovery. [Troubleshooting, Saving & Version Control](https://docs.pen.dev/troubleshooting#saving--version-control)

**Unverified:** separate page hierarchy, global layer search, multi-file switching, persisted camera/selection, unsaved reopening, crash recovery, and disconnected operation.

## 2. Visual edits and layout

**Documented schema contract, not measured browser behavior:** version `2.17` represents a graphical object tree. Layout supports horizontal/vertical flex or absolute placement, gap, per-side padding, and alignment. Sizes can be fixed, fit children, or fill a parent. Text distinguishes unwrapped auto size, fixed-width wrapping with growing height, and fixed-width/height overflow. Graphics include layered fills, image fit/fill/stretch, gradients, shader fills, strokes, blur, and shadows. Typography has family, weight, size, line height, spacing, and alignment. The published Layout/Size interfaces contain no grid, margin, min/max, wrapping-layout, or breakpoint fields; that is a schema finding, not a claim about every UI feature. [The .pen Format, Layout and TypeScript Schema](https://docs.pen.dev/for-developers/the-pen-format#typescript-schema)

**Documented workflow:** import an image through drag/drop, clipboard, toolbar, or desktop file menu; supported imports include PNG, JPEG, and SVG. Select content, choose export size/format at the bottom of Properties, then export PNG, JPEG, WEBP, or PDF. Whole Figma-file import and individual Figma-layer paste are separate paths; pasting image-bearing Figma layers is specifically limited. [Import & Export](https://docs.pen.dev/core-concepts/import-and-export)

**Observed:** selected text exposes typography and resizing; selected frames expose flex direction, alignment, gap, padding, Fill/Hug sizing, and clipping. A numeric padding edit detached that binding, and undo restored it. See the hands-on results below. **Unverified:** panel search, mixed selections, min/max, direct spacing handles, snapping/modifiers, keyboard focus order, screen-reader labels, cropping gestures, and breakpoints. 

## 3. Reuse and design systems

### Variables and themes

**Documented workflow:** open Variables from the toolbar, define reusable values, and bind element properties. Editing a variable updates its uses. Additional columns create themes, selected through Properties. CSS import/export is agent-mediated. Figma-token import instructions include agent reconstruction from a variable-table screenshot. [Variables](https://docs.pen.dev/core-concepts/variables)

**Documented schema details:** variables support boolean, number, color, and string values or variable references; themes can have multiple axes. Components use `reusable` origins, `ref` instances, and descendant property/replacement overrides. Imports reference other files by relative URI. Shader uniforms include automatic resolution/time bindings. [The .pen Format, Variables and Themes; TypeScript Schema](https://docs.pen.dev/for-developers/the-pen-format#variables-and-themes)

**Observed:** changing a spacing variable propagated to padding/gap; numeric entry detached padding alone and undo restored its binding. **Unverified:** alias-picker UX, circular-alias failure, scopes/filtering, mode inheritance visibility, dedicated reset controls, and finding every use.

### Components, slots, and cross-file libraries

**Documented workflow:** select an element, use Cmd+Option+K or Create component, and copy the origin to make an instance. The origin is magenta; instances are violet. Edit the origin to propagate, or use Go to component from an instance. Nested components are supported. [Components](https://docs.pen.dev/core-concepts/components)

**Documented workflow:** an empty frame inside a component origin can become a slot. Mark suggested components through the Slots row, create an instance, then drop/paste content into its slot. Suggested components guide human and agent composition. [Slots](https://docs.pen.dev/core-concepts/slots)

**Documented workflow:** a component-populated file can become a design library through the Libraries panel, acquiring the `.lib.pen` suffix. Other files import it there; Assets offers a searchable grid for placing reusable content. The guide promises changes to library components propagate to their uses, and warns that turning a file into a library cannot be undone. [Design Libraries](https://docs.pen.dev/core-concepts/design-libraries)

**Unverified:** distinct variant sets, exposed instance properties, override reset, return-to-instance navigation, usage census, concurrent library updates, missing-library recovery, and propagation refresh requirements.

## 4. Runtime and interactivity

**Documented:** Code on Canvas creates a Script node linked to a relative `.js` file. Header-declared inputs become Properties controls; size, input, and source-file changes rerun the script. It returns native design nodes. Execution is synchronous and sandboxed without DOM, network, filesystem, timers, or async; the stated budget is 1,000 output nodes and two seconds. Generated children are derived state outside undo history. Convert to layers replaces the script with an editable snapshot. [Code on Canvas, How it Works and API Reference](https://docs.pen.dev/core-concepts/code-on-canvas)

**Documented representative workflow:** insert Script from the shape dropdown, point it at a sibling JavaScript file, resize it, alter inputs, edit/save the script, and optionally convert its output. **Inferred:** conversion changes ownership of subsequent edits; this is not evidence of React execution or form submission. [Code on Canvas, Getting Started](https://docs.pen.dev/core-concepts/code-on-canvas#getting-started)

**Documented source:** `chart.js` parses series inputs and calculates native path/text geometry; it contains no network fetch or application state store. [chart.js at e864170](https://github.com/highagency/pencil-scripts/blob/e86417027afaa80525cbdd949cce439294417889/chart.js)

**Documented source:** `clock.js` draws hands from explicit time inputs; its title does not establish a ticking runtime. Its older `@schema 2.10` also requires compatibility checking. [clock.js at e864170](https://github.com/highagency/pencil-scripts/blob/e86417027afaa80525cbdd949cce439294417889/clock.js)

**Documented marketing claim:** the homepage describes parallel AI agents as multiplayer and says outside MCPs can provide database/API/browser information. **Inferred:** an external agent gathering data and drawing it is a different capability from the rendered design fetching live data itself. [Homepage, AI multiplayer and bi-directional MCP sections](https://www.pen.dev/)

**Unverified:** clickable screen-to-screen prototype links, event-bound variables, input focus and typing in a preview, click-driven state transitions, routing, persistence across sessions, embedded application execution, published runnable URLs, and export fidelity for interactive behavior. 

## 5. Code and agents

**Documented workflow:** put `.pen` beside the source; ask the agent to recreate an existing component; edit its visual representation; ask the agent to apply changes back to application code. Token synchronization follows the same explicit ask/import/export sequence. The guide calls this two-way sync. **Inferred:** the steps establish agent-mediated translation, not deterministic source projection or preservation of arbitrary logic. [Design ↔ Code, Code → Design and Two-Way Sync](https://docs.pen.dev/design-and-code/design-to-code)

**Documented:** current MCP documentation names `execute` for insert/copy/update/replace/move/delete, tree retrieval via `Get`, variable operations, image generation, and screenshots. `get_app_state` supplies editor, file, and selection context. `Get` visitors expose bounds and problems for layout analysis. The supported assistant list extends beyond Claude to Cursor, Codex, Windsurf, Antigravity, and OpenCode. [AI Integration, Supported AI Assistants and MCP Tools Available](https://docs.pen.dev/getting-started/ai-integration)

**Documented:** CLI `Export()` supports HTML as well as graphics. This is distinct from prompted application-code generation. [CLI, Visual Operations](https://docs.pen.dev/for-developers/pen-cli#visual-operations)

**Documented recovery guidance:** troubleshooting admits canvas/export visual mismatches and suggests preserving a reference screenshot, retrying, and reporting a reproduction. It also warns of Codex configuration duplication and inaccessible folder permissions. [Troubleshooting, Importing & Exporting and MCP & AI Integration](https://docs.pen.dev/troubleshooting)

**Unverified:** React-import and round-trip fidelity, preservation of local edits, merge behavior, failed-batch atomicity, raw `.pen` watching, and identity between code/design nodes. Script-file watching does not establish arbitrary application-source watching.

## 6. Collaboration, delivery, and service boundaries

| Boundary | Evidence and status |
| --- | --- |
| Local editing and files | **Documented:** local MCP and `.pen` alongside code. This answers design-operation placement, not all service dependencies. [AI Integration](https://docs.pen.dev/getting-started/ai-integration#mcp-model-context-protocol) |
| Authentication | **Documented:** product activation and AI-provider authentication are distinct in the guide. The EULA requires account authentication on launch. Cached/offline grace behavior is **unverified**. [Authentication](https://docs.pen.dev/getting-started/authentication), [EULA §2](https://www.pen.dev/eula) |
| Own-provider text AI | **Documented policy:** inputs/outputs travel directly between device and the user's chosen provider rather than High Agency servers. This is still remote processing. [Privacy Policy §1](https://www.pen.dev/privacy-policy) |
| Pen-provided AI | **Documented policy, conditional availability:** Pro-model traffic uses inference partners. Its actual plan availability here is **unverified**. [Privacy Policy §1](https://www.pen.dev/privacy-policy) |
| Images, SVG, stock | **Documented policy:** these requests transit High Agency infrastructure to providers. The policy says content is forwarded without being retained by High Agency; this study did not audit traffic or provider retention. [Privacy Policy §4a](https://www.pen.dev/privacy-policy) |
| Analytics and diagnostics | **Documented policy:** PostHog and Sentry receive usage/technical data, with inputs/outputs excluded according to the stated configuration. [Privacy Policy §4](https://www.pen.dev/privacy-policy) |
| Cloud infrastructure | **Documented:** the current processor list names an AI gateway, model hosting, backend/cloud hosting, database, email, payment, and telemetry services. That list does not prove cloud design-file synchronization or multiplayer. [Sub-processors](https://www.pen.dev/sub-processors) |
| Multiplayer | **Conflicting documentation:** public troubleshooting denies real-time multiplayer, while installed MCP guidance describes a collaborative multiplayer setting. A two-person edit was not tested; availability is **unverified**. [Troubleshooting](https://docs.pen.dev/troubleshooting#no-real-time-collaboration) |
| Versioning and review | **Documented:** commit, branch, merge, and review designs with Git. Actual merge quality and visual review ergonomics are **unverified**. [Design as Code](https://docs.pen.dev/core-concepts/design-as-code) |
| Sharing, comments, permissions | **Observed affordance:** Share offers a frozen snapshot view/download link and includes a script dependency. No link was created, so recipient behavior is **unverified**. Native comments, roles, and review invitations remain **unverified**. [Share dialog](evidence/pen-06-share-snapshot.png) |
| Pricing | **Documented:** the public pricing page says the product is currently free and future paid plans would be disclosed before charging. This does not establish free use of external models or IDE plans. [Pricing](https://www.pen.dev/pricing) |
| Ownership and portability | **Documented:** terms distinguish user-owned inputs/outputs from product software; first-party designated design assets have a separate license and third-party assets retain theirs. **Inferred:** ownership, open-format claims, source availability, and runnable portability are separate questions. [Terms §5–5a](https://www.pen.dev/terms-of-use) |

Authentication-guide shorthand names Claude as the AI exception; the detailed policy describes additional paths. Use the feature-specific distinctions above. [Authentication, Security & Privacy](https://docs.pen.dev/getting-started/authentication#security--privacy)

## Contradictions and evidence boundaries

| Tension | Consequence for this study |
| --- | --- |
| Public readable-JSON/open-format statements versus installed MCP metadata describing encrypted files | Installed MCP metadata said “.pen files are encrypted” and required MCP-only access. This is an **observed tool contract**, not disk proof of encryption. The study did not inspect `.pen` bytes. |
| Read/write developer reference versus “do not manually edit” troubleshooting advice | Developer documentation supports read/write; troubleshooting discourages manual editing. Raw editing compatibility remains unresolved. [Format](https://docs.pen.dev/for-developers/the-pen-format), [Troubleshooting](https://docs.pen.dev/troubleshooting) |
| Local-only language versus processing policy | Local design engine does not imply local inference, anonymous access, or no telemetry. The service-boundary table records the narrower supported claims. |
| “Two-way sync” versus prompt-driven steps | The official steps establish an iterative agent workflow. Automatic source equivalence remains unverified. |
| Multiplayer described differently across sources | Homepage “AI multiplayer” means parallel agents; public troubleshooting denies real-time multiplayer; installed MCP guidance describes collaboration/multiplayer. Share exposes snapshots. None resolves live two-person editing without a concrete test. |
| Cross-file components | Public Libraries documentation describes cross-file reuse; installed component guidance says components cannot cross files. The GUI exposes Libraries, but library import/propagation was not tested. This remains an unresolved version/surface distinction. |
| Installation says Windows desktop exists; troubleshooting says it does not | Both display the same update date. This report makes no current Windows-support claim; the target of this session is the Mac app. |
| Script examples use older schema values | The code-on-canvas page's examples use `2.11`, its API section asks for `2.17`, and the linked repository samples use `2.10`. Use the installed schema/tool contract to construct tests. |

## Hands-on evidence from this Mac

**Observed environment:** Pen **1.2.8**, macOS desktop, bundle ID `dev.pencil.desktop`. Account-plan entitlements were not independently established. All edits used synthetic content in [pen-study.pen](evidence/pen-study.pen), with [sample.png](evidence/sample.png) and [pen-runtime.js](evidence/pen-runtime.js.txt). Existing user designs were preserved. The `.pen` artifact was accessed through MCP, not filesystem parsing.

| Task and steps | Result and evidence |
| --- | --- |
| Create and persist | GUI New File supplied an 800×600 frame. Save As created the study; Cmd+S cleared Edited. Cmd+O reopened it in the same app session: accessibility/MCP reads retained width 320, spacing 24, long text, image path, instance override, and Script inputs count 3/label Saved. This was not a cold restart, offline, or auto-save test. |
| Build the common scenario | MCP authored a 390px Reading list with a filling card, variable-bound spacing, image area, wrapping text, a reusable Button origin, and two references. The second reference overrode its label to Keep reading. [Initial fixture](evidence/pen-01-fixture.png). The final fixture uses `sample.png` as an actual image fill; earlier screenshots show the placeholder before loading. |
| Edit text by hand | Double-click title, Enter, Cmd+A, type, Escape. The resulting content was “longer story about making time for the books you want to read”; its measured height grew from 19 to 38 and the card grew. Some intended initial characters were lost during automation; this was not diagnosed as a product defect. [Text selection](evidence/pen-02-text-wrap.png) shows the later state **after** the spacing-variable update, not an isolated before/after text comparison. |
| Edit the shared source | MCP changed Button-origin padding from 16 to 24. Resolved reads showed both instances updating while Keep reading remained overridden. Cross-file and React propagation were not tested. |
| Bind, detach, undo | MCP changed spacing from 16 to 24; bound card padding and gap followed. GUI entry of 20 into padding produced literal padding `20`, gap still bound to spacing, and variable still `24`, verified by MCP. Escape then Cmd+Z restored the padding binding. [Detached padding, bound gap](evidence/pen-03-padding-detached.png). |
| Resize the screen | MCP narrowed Reading list from 390 to 320. The title then wrapped to three lines. [Narrow screen](evidence/pen-04-script-input.png). This is resizing, not a media-query test. |
| Execute code and expose inputs | A Script node referenced `pen-runtime.js`. Changing its source from bare text to a white frame immediately changed the rendered output. GUI controls exposed count and label; setting count from 1 to 3 rendered Saved: 3. [Script input and output](evidence/pen-04-script-input.png). Application events/networking were not tested. |
| Present the design | Present displayed the card as a slide. Clicking Save did not change its state. The synthetic button reference had no event wiring, so this establishes only that this fixture did not act like a working form. [Presentation](evidence/pen-05-presentation.png). |
| Inspect sharing | Share described a frozen snapshot, with anyone holding the link able to view/download the `.pen`; it listed one script dependency. No share link was created. Upload, recipient behavior, and multiplayer were not tested. [Snapshot dialog](evidence/pen-06-share-snapshot.png). |
| Inspect libraries | GUI Libraries exposed built-in libraries and Turn file into library. No file was converted and no import was tested. Public cross-file propagation remains a documented claim. |
| Export | MCP `Export` with `html-css` exported Reading list to [pen-export.html](evidence/pen-export.html). Text inspection confirms column flex layout, fixed 320×600 screen, filling/hugging descendants, and `data-pencil-name` attributes. Bound spacing resolves to literal `24px`, without CSS variables. Both button instances become styled `div` trees with their different labels and `12px 24px` padding. The image becomes a relative `sample.png` background with cover sizing. This export has no scripts, handlers, or semantic button elements; the source fixture was unwired, so behavior preservation was not tested. The external Google Fonts stylesheet is an additional dependency. Browser fidelity and source round-trip remain unverified. |

**Observed agent friction and recovery:** `read_skill` failed until a document was open. A `TakeScreenshot` in the same execute call as node creation returned blank although subsequent GUI inspection showed the content; later evidence uses GUI screenshots. A variable named `penText` was undefined in the next execute call despite persistence guidance, so the investigator recovered through documented edit IDs and literal returned IDs. After reopening, native screenshot capture also returned blank; persistence was checked through accessibility/MCP reads. The failures are specific to these sequences.

**Remaining hands-on gaps:** cold-restart/recovery/offline behavior; direct spacing drags/snapping; mixed selection and accessibility; component-definition navigation; cross-file import; code-to-design-to-code preservation; wired application input/state/routing; published snapshot behavior; and actual concurrent human editing. 

## Interesting precedent for Spool, separated from recommendations

**Inferred:** contextual agent access, variable binding versus literal overrides, reusable definitions, and explicit conversion of generated content are useful precedents. Token management, instances, and asset discovery are distinct concerns.

**Model difference:** Spool centers live TSX and browser behavior; Pen’s documented workflow owns a graphical tree, using translation or bounded scripts to connect it with code. Similar local-file and agent surfaces do not establish equivalent source ownership, layout authority, runtime, or collaboration. These are research findings, not implementation mandates.
