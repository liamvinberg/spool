# Evenly

Evenly, splitting a restaurant bill; each person is a colour.

- Screens (`screen`): `receipt`, pick a person, tap what they had; `shares`, what each friend owes you; `sent`, requests out, the money coming back.
- Agent ask: "add splitting the bill: claim, shares, settled".
- Knob card: `card`: radius (corners) of the person cards on `shares`; `people`: each person's colour (you, leo, nina, ruby), in `knobs.ts`.
- Who claimed what lives in `ui.state.evOwners`. Back is `ui.back()`.

A clip copies this folder to `design/shared/kit/evenly/` (`kit: ["evenly"]`). One frame per screen; `onNext` is where its primary action walks:

```tsx
import { ui } from "spool";
import { Evenly } from "shared/kit/evenly/evenly";

export default function Frame() {
	return <Evenly screen="receipt" onNext={() => ui.go("evenly-shares")} />;
}
```
