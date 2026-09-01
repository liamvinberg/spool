import { DockScreen } from "../../../shared/ui/spool-dock-screen";

/**
 * over — the agent leaves the column and stands on the field.
 *
 * Properties keeps the rail it was given, so the column never moves and the
 * field only ever loses its 300. The agent becomes a window: a pill in the
 * corner opens it, the head drags it anywhere, closing it hands every pixel
 * back. It is the only take where both surfaces are up and the field keeps its
 * width.
 *
 * The cost is the one thing a rail never does, which is cover the work. The
 * frame you are asking about is the frame the panel is standing on, and the
 * canvas underneath is the surface the whole product is built around — a window
 * over it is a second place for something to be, and spool has been careful to
 * have only one.
 *
 * Open the pill, drag the head, run a turn with ⏎, close it and watch the field
 * come back whole.
 */
export default function DockOverFrame() {
	return (
		<DockScreen take="over" argues="A window keeps the field's width and spends the field's middle." />
	);
}
