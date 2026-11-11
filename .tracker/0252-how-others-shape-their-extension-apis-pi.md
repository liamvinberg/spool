# #252 · How others shape their extension APIs: pi, Raycast, VS Code, Obsidian, tldraw, Figma

- State: closed
- Labels: wayfinder:research
- Parent: #251
- Tasks: task 557 (Spool presentations and extension core)
- Created: 2026-11-10T08:20:58.080Z
- Updated: 2026-11-10T08:31:34.935Z
- Closed: 2026-11-10T08:31:34.935Z

## Question

How do pi (pi.dev), Raycast, VS Code, Obsidian, tldraw and Figma shape their extension APIs, and what should spool take, avoid and do better?

Spool is being rebuilt as a small core with an extension API its own features are built on (see the map). Before the API is put on paper we want the facts from primary sources (official docs and source), per product:

1. The unit of extension and its manifest.
2. The extension points it offers.
3. The UI model: does the host draw from a declaration (Raycast), or does the extension render freely?
4. Trust and isolation: where extension code runs and what it can reach.
5. Install, distribution and store; what ships on by default; how a newcomer picks extensions (Raycast's onboarding).
6. Per user or per project: what happens when a collaborator opens a project that needs an extension they lack.
7. How the API is versioned and kept stable.
8. What the product's own built-ins use: the public API or a private one.
9. Known regrets and limits.

End with what to take, what to avoid, and where spool can do better given what is particular to it: two origins (a trusted window and a walled-off render origin for frame code), frames that declare while the window draws (knobs), agents as the main authors of code, and team projects that sync files to every teammate. Liam: "if we can do better we want to focus on that, clean".

## Comments

### agent, 2026-11-10T08:31:34.935Z

## Resolution (research, task 557, 2026-11-10)

# Extension APIs: evidence for Spool

Primary sources fetched live. Constraints are not attributed regrets. Spool: trusted window/daemon, isolated agent-TSX frames, host-drawn knobs, file-synced teams; presentations first.

## pi (pi.dev)
- **Unit/slots/UI:** TS/JS factory receives `ExtensionAPI`; a single file needs no manifest. Packages expose extensions/skills/prompts/themes through conventions or `package.json#pi`. Slots: lifecycle/input/tool hooks, model tools/renderers, commands, shortcuts, flags, providers, messages, status/widgets, editor and custom TUI. Host dialogs + free TUI components; in RPC, `custom()` returns undefined and component factories are ignored. [P1] [P2]
- **Trust:** In-process code has the user's OS permissions, files/credentials/history included. Project trust gates project resources, not subsequent tool authority or prompt injection; real containment needs an OS/virtualization boundary. [P1] [P3]
- **Delivery/defaults/scope:** npm/git/local installs, gallery discovery via `pi-package` keyword. Personal vs project settings; missing project packages install after trust, with startup failure warning/skip/retry. Built-in mcp, llama.cpp, codemode and tool-search load by default; the last two register inactive tools. [P2] [P4]
- **Stability/built-ins/limits:** Pin npm/git versions; do not duplicate host modules. No stability pledge found; schema breaks documented. Tool-search really is an `ExtensionFactory` calling `registerTool`, not proof all core uses extensions. Limits: authority, hook ordering, UI portability. [P1] [P2] [P5] [P6]

## Raycast
- **Unit/slots/UI:** One package groups commands. npm-compatible manifest declares entry points/modes (view, no-view, menu-bar), arguments/preferences/platforms and AI tools. React describes host components rendered natively, not arbitrary DOM/webviews; OS operations are exposed separately. [R1] [R2]
- **Trust:** Child Node process; each extension gets a worker-thread V8 isolate and memory limit. Host APIs use RPC, but Node filesystem/network access is **not permission-sandboxed**. Store source is reviewed, not least-privilege. [R3]
- **Delivery/defaults/scope:** App includes built-ins. Store search/categories expose descriptions, commands, screenshots and authors; installing adds Root Search commands. Team members install private extensions from an organization Store. No project-dependency resolver established. Exact first-run extension picker **unconfirmed**. [R4] [R5]
- **Stability/built-ins/lessons:** Store has one implicit latest extension version and auto-updates; host checks API compatibility. API compatibility within majors; deprecation/transitions for breaks. Retrospective: JSC + hand-built JSON/state UI failed on npm compatibility, state complexity and endless polyfills; React + Node replaced it. Native integrations were ported to public extensions after outsiders needed missing capabilities. Universal parity unverified. [R2] [R6]

## VS Code
- **Unit/slots/UI:** Manifest declares identity, entry points, engine range, activation, contributions and dependencies/packs. Commands/menus/keys/settings/views/themes/languages are declarative; runtime providers add editing/SCM/debugging. Host draws chrome; webviews allow HTML/CSS/JS. Workbench DOM/CSS stays private/refactorable. [V1] [V2]
- **Trust:** Local/remote Node hosts or browser WebWorker; `extensionKind` controls preferred placement. Lazy activation limits startup work. Node extensions inherit VS Code permissions. Publisher trust and workspace Restricted Mode are not per-extension OS sandboxes; restricted capabilities can disable features/withhold dangerous workspace settings. [V3] [V4] [V5]
- **Delivery/defaults/scope:** Marketplace/VSIX/CLI; many bundled core extensions. Discovery: installed/recommended lists. Shared `.vscode/extensions.json` recommends IDs and prompts on first open, not a project version lock or silent install. Settings Sync carries personal extensions across one's devices. [V4] [V6]
- **Stability/built-ins/limits:** Stable API promises future compatibility; `engines.vscode` gates host versions. Proposed APIs are unstable and not for Marketplace publication. Qualified dogfooding: bundled Git enables numerous proposals unavailable to ordinary stable published extensions. Costs: API breadth, separate webview UI; no DOM patches by design. [V1] [V2] [V6] [V7] [V8]

## Obsidian
- **Unit/slots/UI:** `manifest.json`: ID, SemVer, minimum app version, desktop-only flag. Bundled `main.js` exports `Plugin` subclass. Vault/workspace/metadata access, commands, ribbon/status, views/settings, Markdown processors and editor extensions. Direct DOM UI, not host-only declarations. Lifecycle helpers clean up subscriptions/intervals. [O1] [O2]
- **Trust:** Plugins inherit app access: files, network, installing programs. Restricted Mode defaults on and ignores installed community plugins. Every version is scanned; selective manual review, not sandboxing. [O3]
- **Delivery/defaults/scope:** Core plugins bundled, some disabled. Directory has separate Install/Enable; updates manual for security. Plugins are vault-scoped; Sync separately opts into installed and active community-plugin lists. No guaranteed teammate parity/dependency resolver. [O2] [O4] [O5] [O6]
- **Stability/built-ins/limits:** `versions.json` maps releases to minimum app versions, allowing older hosts a compatible fallback. Public typings retain deprecated compatibility interfaces; no universal no-break pledge established. Core/public-API parity unverified. DOM freedom and ambient app authority are the costs. [O1] [O2] [O7]

## tldraw
- **Different category:** React SDK for app authors, not a documented end-user plugin store/loader. No extension manifest: props/util classes register shapes/bindings/tools/actions/keys/UI slots/overlays/content handlers. Shapes combine validated JSON props, geometry/behavior and React rendering. UI slots can be replaced/hidden, or the whole UI replaced. [T1] [T2] [T3]
- **Trust/delivery/defaults:** Imported components run in the browser app without plugin isolation; app deployment distributes them. `Tldraw` supplies default shapes/UI; group is always-present core. [T1] [T2]
- **Collaboration/stability:** Document and per-user session state are separate. Custom schemas must exist on client and server; validation/migrations support cross-version collaboration. Missing migrations can cause errors; server backward compatibility is finite. SDK is **not SemVer**: minors may break APIs. Not independent team plugin installation. [T4] [T5] [T6]
- **Built-ins/limits:** Genuine seam reuse: `GeoShapeUtil` extends `BaseBoxShapeUtil` with static type/props/migrations; default UI controls the editor through exposed methods. Take this split/persistence, not ambient authority/all-peers-know-all-schemas. [T2] [T7]

## Figma: distinguish plugins from widgets
- **Plugin unit/slots/UI:** Manifest declares ID, JS, optional HTML, API version, editor types, commands/parameters, relaunch buttons, document access and network domains. Dedicated document API; parameters/relaunch buttons are host-drawn, custom UI is arbitrary iframe HTML/JS, with no official core UI kit. Actions, not general persistent chrome/tool slots. [F1] [F2]
- **Trust:** Logic runs **main-thread sandboxed**, not in a worker. It accesses the scene, not browser DOM; iframe accesses browser APIs, not scene; messages connect them. Network allowlists have a documented embedded-site subresource caveat. Main-thread execution is not CPU isolation. Dynamic-page access avoids loading entire files. [F1] [F3]
- **Delivery/defaults/scope:** Community plugins explicitly run; saving is account-scoped. Organizations can save for everyone/require approval. No default third-party set established. Generally one user-initiated plugin, no background services; Dev Mode screenshot also shows “run automatically” (scope not explained). Collaborators get document relaunch buttons. [F2] [F4] [F5]
- **Widgets:** Closer to collaborative deck semantics: declarative TSX-like host components in a shared on-canvas object; manifest adds `containsWidget`/`widgetApi`. Everyone sees/interacts with it. Interaction code runs on the initiating client; results sync via document. Rendering depends only on widget state; document/network side effects belong in update handlers. Same sandbox; iframe escape hatch. [F6] [F7] [F8]
- **Stability/built-ins/limits:** Manifest pins API major; additive updates/some fixes arrive automatically; old majors supported as long as practical. Typings may break in minor updates even when published JS remains compatible; new document enum variants can still break exhaustive consumers. Built-in/public-API parity unverified. Limits: broad scene mutation, main-thread work, bounded surfaces, iframe UI inconsistency. [F2] [F3] [F9]

## What Spool should take, avoid, do better
Proposals:

1. **One package, multiple typed contributions.** pi factory + VS Code declarations, not one package per command. Manifest: namespaced ID, runtime entry points, API range, capabilities, owned data formats. Distinguish package/API/data versions. [P1] [V1] [R2] [T5]
2. **Host owns chrome; frames declare.** Extend knobs to properties/menu/key/frame calls. Typed declarations + shared primitives, not a new UI/state framework. Rich custom panes need isolation; arbitrary React in the trusted window inherits daemon authority. Take Raycast coherence, avoid its failed JSON/state framework. [R2] [R3] [V2] [F3]
3. **Enforce authority.** No daemon/agent credential at render origin. Validate message sender/source, schema, size and frame/project scope. Broker capabilities; no generic daemon-route bypass. Agent-spawning code needs local approval and enforceable containment, or an honest fully-trusted label. Iframes cannot sandbox Node authority. [P3] [R3] [V5] [F3]
4. **Sync intent, never consent.** Team files declare IDs/formats and pin artifacts; install executables in local cache, not auto-executed `design/`. Explain missing/incompatible extensions; explicit install/enable, safe viewing without them. Never sync grants/credentials/personal enablement. [P2] [P3] [V4] [O6]
5. **Preserve meaning without code.** Deck frames/order/notes stay readable; preserve unknown data losslessly, explain missing behavior. No silent deck-to-page conversion/old-client schema rewrite. Presenter state stays local; content/presence are distinct. Adopt migrations and document/session separation, improve on all-peers-know-all-types. Side effects run once, not on every peer. [T4] [T5] [F7]
6. **No privileged bypass.** Official presentations/Pages/Properties use public slots/broker. Ship a useful enabled baseline, not an empty canvas/store quiz. Optional discovery follows workflow/project needs. Test public parity; naming something “extension” proves nothing. [R2] [V6] [V8]
7. **Stable, bounded contracts.** Stabilize slots after official dogfooding. Additive API within majors; experimental seams, migrations, exact rollbackable team packages. Lazy activation, disposables, cancellation, crash attribution. Avoid minor-breaking APIs/latest-only document dependencies. Agents need generated schemas/types, small examples and structured errors. [V3] [V7] [O2] [T6] [R6]

**Unconfirmed:** Raycast onboarding picker, exhaustive enabled defaults, pi/Obsidian stability pledges, closed-source parity. Rewrite size not weighed.

## Sources
[P1]: https://pi.dev/docs/latest/extensions
[P2]: https://pi.dev/docs/latest/packages
[P3]: https://pi.dev/docs/latest/security
[P4]: https://pi.dev/docs/latest/settings
[P5]: https://pi.dev/changelog
[P6]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/extensions/tool-search/index.ts
[R1]: https://developers.raycast.com/information/manifest
[R2]: https://www.raycast.com/blog/how-raycast-api-extensions-work
[R3]: https://developers.raycast.com/information/security
[R4]: https://manual.raycast.com/extensions
[R5]: https://manual.raycast.com/teams/shared-features
[R6]: https://developers.raycast.com/information/versioning
[V1]: https://code.visualstudio.com/api/references/extension-manifest
[V2]: https://code.visualstudio.com/api/extension-capabilities/overview
[V3]: https://code.visualstudio.com/api/advanced-topics/extension-host
[V4]: https://code.visualstudio.com/docs/configure/extensions/extension-marketplace
[V5]: https://code.visualstudio.com/api/extension-guides/workspace-trust
[V6]: https://code.visualstudio.com/api
[V7]: https://code.visualstudio.com/api/advanced-topics/using-proposed-api
[V8]: https://github.com/microsoft/vscode/blob/main/extensions/git/package.json
[O1]: https://docs.obsidian.md/Reference/Manifest
[O2]: https://github.com/obsidianmd/obsidian-api
[O3]: https://obsidian.md/help/plugin-security
[O4]: https://obsidian.md/help/plugins
[O5]: https://obsidian.md/help/community-plugins
[O6]: https://obsidian.md/help/sync/settings
[O7]: https://docs.obsidian.md/Reference/Versions
[T1]: https://tldraw.dev/docs/shapes
[T2]: https://tldraw.dev/sdk-features/ui-components
[T3]: https://tldraw.dev/sdk-features/actions
[T4]: https://tldraw.dev/docs/persistence
[T5]: https://tldraw.dev/docs/sync
[T6]: https://tldraw.dev/releases
[T7]: https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/geo/GeoShapeUtil.tsx
[F1]: https://developers.figma.com/docs/plugins/manifest/
[F2]: https://developers.figma.com/docs/plugins/
[F3]: https://developers.figma.com/docs/plugins/how-plugins-run/
[F4]: https://help.figma.com/hc/en-us/articles/360042532714-Use-plugins-in-files
[F5]: https://help.figma.com/hc/en-us/articles/4404239055127-Save-plugins-and-widgets-for-an-organization
[F6]: https://developers.figma.com/docs/widgets/
[F7]: https://developers.figma.com/docs/widgets/how-widgets-run/
[F8]: https://developers.figma.com/docs/widgets/widget-manifest/
[F9]: https://developers.figma.com/docs/plugins/stability-updates/
