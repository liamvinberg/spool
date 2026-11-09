# Dill

A recipe, photographed: brown butter gnocchi, cooked step by step with timers, then rated.

- Screens (`screen`): `recipe`, `step`, `done`. The primary action walks on through `onNext()`; servings are shared state.
- Agent ask: "add cooking mode: recipe, steps, done".
- Knob card: `sheet.radius` (corners), `sheet.accent`, `sheet.paper` on the sheet over the photo; also `motion.spring`, `motion.replay`.

```tsx
import { ui } from "spool";
import { Dill } from "shared/kit/dill/dill";

export default function Frame() {
	return <Dill screen="recipe" onNext={() => ui.go("step")} />;
}
```
