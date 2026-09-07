import { memo, type ReactNode } from "react";

function Button({ frame, constrained = false }: { frame: string; constrained?: boolean }) {
	return (
		<button
			type="button"
			className="ev-button"
			style={{ width: 184, maxWidth: constrained ? 120 : "100%", height: 48 }}
			data-shared="button"
			data-name="Button"
			data-owner="shared/ui/button.tsx"
			data-frame={frame}
		>
			<span data-literal="">Explore</span>
			<span data-literal="">↗</span>
		</button>
	);
}

function Screen({ frame, title, children }: { frame: string; title: string; children: ReactNode }) {
	return (
		<article className="ev-frame" data-frame-shell={frame}>
			<div className="ev-frame-label" data-editor-furniture="">
				{title}
				<span>{frame}</span>
			</div>
			<div className="ev-screen es-screen" data-name={title} data-frame={frame}>
				{children}
			</div>
		</article>
	);
}

// Native layout and in-memory edits only. Source reach is the reference's simulation.
export const Demo = memo(function Demo() {
	return (
		<div className="ev-board">
			<Screen frame="booking" title="Sibling edges and parent content">
				<main className="es-column" data-name="Padded parent">
					<Button frame="booking" />
					<div className="es-stop" style={{ width: 200 }} data-name="200px sibling">
						A place to begin.
					</div>
					<div className="es-stop" style={{ width: 280 }} data-name="280px sibling">
						Room for the whole weekend.
					</div>
				</main>
				<p className="es-caption" data-editor-furniture="">
					Resize the button toward either sibling, or the parent's inner edge. Cmd/Ctrl temporarily releases the
					alignment.
				</p>
			</Screen>
			<Screen frame="confirmation" title="Shared width, constrained result">
				<main className="es-column" data-name="Constrained parent">
					<Button frame="confirmation" constrained />
					<div className="es-stop" style={{ width: 200 }} data-name="Unreachable 200px sibling">
						Still limited to 120px.
					</div>
					<div className="es-stop" style={{ width: 280 }} data-name="280px sibling">
						The declaration is shared.
					</div>
				</main>
				<p className="es-caption" data-editor-furniture="">
					This use keeps its 120px maximum. A resize cannot earn a guide at 200px here.
				</p>
			</Screen>
			<Screen frame="moving" title="Moving and competing siblings">
				<main className="es-row" data-name="Wrapping row">
					<div className="es-stop es-moving" style={{ width: 160, height: 100 }} data-name="Resize this tile">
						Weekend plans
					</div>
					<div className="es-stop" style={{ width: 120, height: 144 }} data-name="Moving sibling">
						A little further.
					</div>
					<div className="es-stop" style={{ width: 200, height: 72 }} data-name="Competing sibling">
						Time to slow down.
					</div>
				</main>
				<p className="es-caption" data-editor-furniture="">
					Changing the first tile can wrap the next one. A guide stays only when the resulting edges still meet.
				</p>
			</Screen>
			<Screen frame="positioned" title="Proportions and centered resize">
				<main className="es-positioned" data-name="Positioned parent">
					<div
						className="es-stop es-moving"
						style={{ position: "absolute", left: 90, top: 76, width: 160, height: 80 }}
						data-name="Free tile"
					>
						The same center.
					</div>
					<div
						className="es-stop"
						style={{ position: "absolute", left: 90, top: 200, width: 200, height: 48 }}
						data-name="200px sibling"
					>
						A nearby edge.
					</div>
				</main>
				<p className="es-caption" data-editor-furniture="">
					Shift keeps proportions. Option holds the center. Cmd/Ctrl releases snapping while those modifiers stay
					available.
				</p>
			</Screen>
			<Screen frame="fractional" title="Fractional bounds and exact values">
				<main className="es-column" style={{ width: 420.5, padding: 23.25 }} data-name="Fractional parent">
					<div className="es-stop es-moving" style={{ width: 184, height: 72 }} data-name="Exact-size tile">
						A deliberate size.
					</div>
					<div className="es-stop" style={{ width: 200.5 }} data-name="Fractional sibling">
						200.5px
					</div>
				</main>
				<p className="es-caption" data-editor-furniture="">
					Dragging uses whole pixels. Use the width field for 200.5px. Fractional bounds cannot earn a false guide.
				</p>
			</Screen>
			<Screen frame="transformed" title="Unsupported geometry">
				<main className="es-column" data-name="Transform parent">
					<div
						className="es-stop es-moving"
						style={{ width: 184, height: 72, transform: "rotate(8deg)" }}
						data-name="Rotated tile"
					>
						A different angle.
					</div>
					<div className="es-stop" style={{ width: 200 }} data-name="200px sibling">
						Use exact values.
					</div>
				</main>
				<p className="es-caption" data-editor-furniture="">
					The rotated tile refuses this resize path and keeps its Properties fields available.
				</p>
			</Screen>
			<div className="ev-below">
				<Screen frame="journal" title="Off-screen shared use">
					<main className="es-column">
						<Button frame="journal" constrained />
					</main>
				</Screen>
			</div>
		</div>
	);
});
