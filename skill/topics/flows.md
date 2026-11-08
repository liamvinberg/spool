---
summary: data-go, ui.go/back/state/use, sessions, arrows
---

Navigation is walking: a session stands in one frame and walks to another by name, which is its full path under frames/ (shop/checkout) from every page, its own included.

data-go="<frame>" on any element walks there on click — nearest data-go ancestor wins, anchors get preventDefault, variants are valid targets. data-transition="<type>" on the same element names the move for transition styling (felt in the player). That is all the markup sugar; everything richer is code:

  import { ui } from "spool";
  ui.go(name, patch?)   merge patch into ui.state, push this frame onto the stack, walk
  ui.back()             pop the stack and walk back; empty stack is a quiet no-op
  ui.state              the session's flat shared state: a plain mutable object, any write re-renders subscribers
  ui.use()              hook — subscribe the calling component to ui.state changes
  ui.copy(text)         write text to the clipboard through the trusted canvas or player

Shared components may own data-go attributes or invoke callbacks passed by the frame. Keep shared UI free of imports from "spool"; pass a callback or destination prop across that boundary.

Coded walks carry no transition name — data-transition rides the element, ui.go has no third argument. Walking to a frame that doesn't exist logs an error and stays put on the canvas and in the player, so a typo never eats the session; a bare frame document walks by navigation and lands on the daemon's 404 instead (topic: verbs). ui.state is schemaless and shared by every frame in the session: initialize defensively (ui.state.items ??= [...]) because any frame can be a session's first. Top-level keys are the unit of reasoning; nested writes still react. Writes belong in handlers and effects, never in a render — a write from a component body makes React run that render again, so the value that render read is dropped, and the runtime warns once per site in the frame's console. A one-shot flag a walk hands over is read in render and cleared in an effect, never cleared by the render that reads it.

Clipboard writes are `await ui.copy(text)` directly inside a click or non-reserved key handler. Show copied state only after that promise fulfills; browser denial rejects with its original error name and message. Clipboard reads and paste are not available.

The session seeds from a scenario before first render — a frame never renders unseeded (topic: scenarios). ?scenario=<name> on a frame document's URL names the seed, and a name different from the running session's restarts it. Two surfaces carry a session across a walk. On the canvas the walk hands it to the next frame, and every frame on a page stands in one session: a write to ui.state in one frame re-renders the frames beside it through their ui.use(), and a frame booting onto that page joins what was already written. Two frames side by side are two clients of one app — put a sender and a receiver next to each other and click. The page's session lives as long as the canvas tab; reload the tab to start it over. In the player the whole walk happens inside one document, and every load is a fresh session — reload is restart. A bare frame document opened on its own (`spool url --raw`) carries nothing: it is sandboxed onto an opaque origin with no storage, so its session ends with the document and a walk out of it starts the next frame from the scenario (topic: verbs).

Arrows claim what the code says. Every literal data-go target and ui.go(name) call anywhere in a frame's folder is an edge, drawn from the element that causes it: solid when the walk is unconditional (will go), faint when the literal sits inside a branch — ternary, if/else, switch, &&/|| (might go; ui.go(ok ? "receipt" : "topup") draws two faint arrows). A destination the parser cannot read (ui.go(routeFor(state))) draws nothing and is reported by `spool flows` as unreadable — prefer literal targets when you want the map to show the flow. Playing never adds or removes an arrow; real walks only flip verified marks on derived edges, dropped when the from-frame's source changes. A headless shot/logs boot never verifies anything.

The player composes every frame into one document, so walks are View Transitions, not navigations: crossfade by default; morphs happen wherever two frames give an element the same view-transition-name. Each swap carries its direction (forward, back) plus any data-transition type as View Transitions types, not root attributes: in shared/transitions.css a bare ::view-transition-* rule styles every swap alike, and :active-view-transition-type() picks one out, plain CSS — html:active-view-transition-type(forward)::view-transition-old(root) { animation: 0.2s slide-out; }. A data-transition type is active alongside its direction, so the narrower rule comes later in the file. Reduced motion is respected. Screen components mount fresh on every arrival.
