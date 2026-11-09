# Sway

A guided mobility class, photographed: open the class, follow along move by move, see the streak.

- Screens (`screen`): `class`, `play`, `done`. Each walks on through `onNext(patch)`; the patch carries the move to start on.
- Agent ask: "add the class: open, follow along, done".
- Knob card: `card.radius` (corners), `card.accent`, `card.paper`; also `type.title` (the title font).

```tsx
import { ui } from "spool";
import { Sway } from "shared/kit/sway/sway";

export default function Frame() {
	return <Sway screen="class" onNext={(patch) => ui.go("play", patch)} />;
}
```
