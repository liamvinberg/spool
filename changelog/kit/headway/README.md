# Headway

Transit in New York: the next train from Union Square, its stops, a live ticket.

- Screens (`screen`): `departures`, `trip`, `ticket`. Walks go through `onGo(to, patch)`; the patch carries the picked departure.
- Agent ask: "add the trip: departures, stops, ticket".
- Knob card: `card.radius` (corners) on the next-train card and the ticket; also `line.green`, `line.pink`, `ticket.today`, `ticket.name`.

```tsx
import { ui } from "spool";
import { Headway } from "shared/kit/headway/headway";

export default function Frame() {
	// departures walks to the trip (a departure, the Trips tab) or the ticket (the Tickets tab)
	return <Headway screen="departures" onGo={(to, patch) => ui.go(to === "ticket" ? "ticket" : "trip", patch)} />;
}
```
