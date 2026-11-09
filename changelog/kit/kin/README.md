# Kin

Kin, paying a friend.

- Screens (`screen`): `amount`, type the amount on a keypad, edge to edge in the accent; `confirm`, review who, how much and the card it comes from; `sent`, paid, the balance counting down.
- Agent ask: "add paying someone: amount, confirm, sent".
- Knob card: `card`: radius (corners) and accent, in `kin.tsx`; the accent also floods the amount and sent screens.
- The amount lives in `ui.state.kinAmount`; pass `{ kinAmount: "0" }` with the walk out of `sent` to start over. Back on `confirm` is `ui.back()`.

A clip copies this folder to `design/shared/kit/kin/` (`kit: ["kin"]`). One frame per screen; `onNext` is where its primary action walks:

```tsx
import { ui } from "spool";
import { Kin } from "shared/kit/kin/kin";

export default function Frame() {
	return <Kin screen="amount" onNext={() => ui.go("kin-confirm")} />;
}
```
