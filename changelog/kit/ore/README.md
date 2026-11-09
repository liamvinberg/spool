# Ore

Ore, a bank in your phone, ordering its steel card.

- Screens (`screen`): `pick`, choose the card's finish (Clay, Moss, Cobalt, Ink, Chalk); `limits`, monthly limit, card settings, where it's posted, then order; `shipped`, on its way, add it to your phone.
- Agent ask: "add ordering the card: pick, limits, on its way".
- Knob card: `card`: radius (corners) and accent (Clay, the house finish), in `knobs.ts`; the same card on all three screens.
- The order is shared between screens in `ui.state`. Back on `limits` is `ui.back()`.

A clip copies this folder to `design/shared/kit/ore/` (`kit: ["ore"]`). One frame per screen; `onNext` is where its primary action walks:

```tsx
import { ui } from "spool";
import { Ore } from "shared/kit/ore/ore";

export default function Frame() {
	return <Ore screen="pick" onNext={() => ui.go("ore-limits")} />;
}
```
