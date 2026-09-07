import { memo } from "react";

export const imageA = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180" viewBox="0 0 480 180"><rect width="480" height="180" fill="#c7cbbb"/><circle cx="250" cy="190" r="145" fill="#889274"/><path d="M0 150L130 48 270 180H0Z" fill="#485947"/></svg>')}`;
export const imageB = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180" viewBox="0 0 480 180"><rect width="480" height="180" fill="#cfc4b3"/><circle cx="350" cy="65" r="35" fill="#f6e9d1"/><path d="M0 180L165 42 330 180Z" fill="#736c62"/></svg>')}`;
function Button({ label, frame }: { label: string; frame: string }) {
	return (
		<button
			type="button"
			className="ev-button"
			style={{
				width: "240px",
				columnGap: "calc(var(--spacing) * 3)",
				color: "var(--color-paper)",
				backgroundColor: "var(--color-forest)",
			}}
			data-shared="button"
			data-name="Button"
			data-owner="shared/ui/button.tsx"
			data-frame={frame}
		>
			<span data-literal="" data-name="Button label" data-owner={`frames/${frame}/frame.tsx`}>
				{label}
			</span>
			<span
				className="ev-button-part"
				data-literal=""
				data-shared="button-part"
				data-name="Button / arrow"
				data-owner="shared/ui/button.tsx"
			>
				↗
			</span>
		</button>
	);
}
function Screen({ frame, title, label }: { frame: string; title: string; label: string }) {
	return (
		<article className="ev-frame" data-frame-shell={frame}>
			<div className="ev-frame-label" data-editor-furniture="">
				{frame}
				<span>480 × auto</span>
			</div>
			<div className="ev-screen" data-name={frame} data-frame={frame} data-owner={`frames/${frame}/frame.tsx`}>
				<header className="ev-nav">
					<span>Northbound</span>
					<nav className="ev-links" style={{ columnGap: "calc(var(--spacing) * 4)" }}>
						<span>Journal</span>
						<span>Trips</span>
						<span>About</span>
					</nav>
				</header>
				<main className="ev-content">
					<div className="ev-header" data-name="Header" data-owner="shared/ui/header.tsx">
						<h1 data-custom="" data-name="Supplied heading">
							{title}
						</h1>
						<h1 data-fallback="" data-name="Default heading" data-owner="shared/ui/header.tsx">
							Your next chapter
						</h1>
					</div>
					<p>Take a little time outside. Small journeys, good company, and a place to come back to.</p>
					<img src={imageA} alt="Green hills" data-name="Trip image" />
					<div className="ev-details" data-name="Trip details">
						<span>Three days</span>
						<span>Stockholm archipelago</span>
					</div>
					<Button frame={frame} label={label} />
					<p data-expression="availability" data-name="Availability">
						{3} places available.
					</p>
					<p className="ev-note" data-name="Booking note">
						No payment needed today.
					</p>
					<div className="ev-reorder" data-name="Keyed itinerary">
						<p data-stable-key="day-1">Arrive</p>
						<p data-stable-key="day-2">Explore</p>
						<p data-stable-key="day-3">Return</p>
					</div>
				</main>
			</div>
		</article>
	);
}
export const Demo = memo(function Demo() {
	return (
		<div className="ev-board">
			<Screen frame="booking" title="A change of scenery." label="Reserve a place" />
			<Screen frame="confirmation" title="Something to look forward to." label="View your trip" />
			<div className="ev-below">
				<Screen frame="journal" title="Keep a little of the journey." label="Read the journal" />
			</div>
		</div>
	);
});
