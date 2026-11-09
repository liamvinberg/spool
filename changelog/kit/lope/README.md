# Lope

A run in London: set a goal and start, run with a live count, save the run around the Isle of Dogs.

- Screens (`screen`): `start`, `run`, `done`. Each walks on through `onNext(patch)`; the patch carries the goal and start time.
- Agent ask: "add the run: set, run, done".
- Knob card: `card.radius` (corners) and `card.accent` (the run's colour); also `numbers.slant`, `numbers.width`, `motion.replay`.

```tsx
import { ui } from "spool";
import { Lope } from "shared/kit/lope/lope";

export default function Frame() {
	return <Lope screen="start" onNext={(patch) => ui.go("run", patch)} />;
}
```
