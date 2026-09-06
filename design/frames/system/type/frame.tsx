import { useEffect, useRef, useState } from "react";
import { Section, Sheet } from "shared/ui/spool/system-sheet";

const ROLES = [
	{ name: "page", className: "type-page", sample: "Your projects", usage: "Home and empty screens" },
	{ name: "heading", className: "type-heading", sample: "Shortcuts", usage: "Section headings" },
	{ name: "title", className: "type-title", sample: "Export 3 frames", usage: "Dialog titles and project names" },
	{ name: "body", className: "type-body", sample: "The checkout is ready. Open the frame to try it.", usage: "Messages and explanations" },
	{ name: "control", className: "type-control", sample: "Open in a new tab", usage: "Buttons, menus and navigation" },
	{ name: "label", className: "type-label", sample: "Appearance", usage: "Compact labels and field names" },
	{ name: "caption", className: "type-caption", sample: "Choose a folder for your project.", usage: "Short supporting sentences" },
	{ name: "value", className: "type-value", sample: "checkout--delivery", usage: "Filenames, paths and editable values" },
	{ name: "detail", className: "type-detail", sample: "4 changes · 18s", usage: "Counts, shortcuts and status" },
	{ name: "code-input", className: "type-code-input", sample: "pnpm dev open", usage: "Commands being entered" },
] as const;

// The specimen uses the actual role class. Its measurements are read from
// the browser so the sheet keeps following the tokens when a role changes.
function Role({ role }: { role: (typeof ROLES)[number] }) {
	const ref = useRef<HTMLSpanElement>(null);
	const [metrics, setMetrics] = useState("");
	useEffect(() => {
		if (ref.current === null) return;
		const style = getComputedStyle(ref.current);
		setMetrics(`${style.fontSize} / ${style.lineHeight} · ${style.fontWeight}`);
	}, []);
	return (
		<div className="grid grid-cols-[180px_1fr_280px] items-center gap-8 border-b border-border py-4">
			<div className="flex flex-col gap-1">
				<span className="type-value">type-{role.name}</span>
				<span className="type-detail text-muted">{metrics}</span>
			</div>
			<span ref={ref} className={role.className}>{role.sample}</span>
			<span className="type-label text-muted">{role.usage}</span>
		</div>
	);
}

export default function Type() {
	return (
		<Sheet title="Type" says="Instrument Sans carries the interface. Fragment Mono carries names, commands and values. Every text role brings its size, line height and weight together.">
			<Section name="The families" says="The app and landing page share Instrument Sans. Each uses a scale suited to how it is read.">
				<div className="grid grid-cols-2 gap-12">
					<div className="flex flex-col gap-3">
						<p className="type-page">Make room for an idea.</p>
						<p className="type-body">Regular <span className="font-medium">Medium</span> <span className="font-semibold">Semibold</span> <span className="italic">Italic</span> · Åäö 0123456789</p>
						<p className="type-detail text-muted">Instrument Sans · variable 400–700 · normal + italic</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="type-code-input">app / checkout--delivery</p>
						<p className="type-value">frame.tsx · 1440 × 960 · ⌘K</p>
						<p className="type-detail text-muted">Fragment Mono · 400 · coding ligatures off</p>
					</div>
				</div>
			</Section>
			<Section name="Text roles" tight>
				<div>{ROLES.map((role) => <Role key={role.name} role={role} />)}</div>
			</Section>
			<Section name="Built from the same foundations" says="Components choose a text role and a semantic colour. Emphasis changes weight; supporting text uses the full muted colour.">
				<div className="grid grid-cols-3 gap-10">
					{[
						["Font, size, spacing", "--font-sans · --text-md · --leading-md"],
						["A complete text role", "--type-body → type-body"],
						["A component on a screen", "message → agent rail"],
					].map(([title, detail]) => (
						<div key={title} className="flex flex-col gap-2 border-l border-border pl-4">
							<span className="type-title">{title}</span>
							<span className="type-detail text-muted">{detail}</span>
						</div>
					))}
				</div>
				<p className="max-w-[540px] type-body">
					Moved <code className="type-value">checkout--delivery</code> to Trash.
					<span className="ml-2 font-medium">Undo</span>
				</p>
			</Section>
		</Sheet>
	);
}
