# Tern

Tern, a flight from London to Lisbon on one big ticket.

- Screens (`screen`): `flight`, the ticket with gate, boarding time and check-in; `seat`, the seat map; `pass`, the boarding pass with its code.
- Agent ask: "add check-in: flight, seat, boarding pass".
- Knob card: `ticket`: radius (corners) and accent, in `tern.tsx`; also `page.paper` and `motion.spring`.
- Back is `ui.back()`. The pick of seat rides the walk as `ternSeat`.

A clip copies this folder to `design/shared/kit/tern/` (`kit: ["tern"]`). One frame per screen; `onGo` names where its actions walk:

```tsx
import { ui } from "spool";
import { Tern } from "shared/kit/tern/tern";

export default function Frame() {
	return <Tern screen="flight" onGo={(to, patch) => ui.go(`tern-${to}`, patch)} />;
}
```
