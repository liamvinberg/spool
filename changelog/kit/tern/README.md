# Tern

Tern, a flight from London to Lisbon; one ticket carries every screen.

- Screens (`screen`): `trips`, the next flight's ticket and the trips after it; `flight`, gate, boarding time, the route; `pass`, boarding passes for two, swipe between them.
- Agent ask: "add check-in: trips, flight, boarding pass".
- Knob card: `ticket`: radius (corners) and accent, in `tern.tsx`.
- Back on `flight` is `ui.back()`.

A clip copies this folder to `design/shared/kit/tern/` (`kit: ["tern"]`). One frame per screen; `onNext` is where its primary action walks:

```tsx
import { ui } from "spool";
import { Tern } from "shared/kit/tern/tern";

export default function Frame() {
	return <Tern screen="trips" onNext={() => ui.go("tern-flight")} />;
}
```
