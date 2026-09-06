import { cn } from "shared/lib/utils";
import "./study.css";

const ROLES = [
	{ name: "Control", sample: "Open folder", size: "13 / 20", treatment: "Sans · 500 · primary text", classes: "font-medium text-base leading-base", uses: "Tabs, buttons, navigation" },
	{ name: "Message", sample: "The cart is ready to try.", size: "14 / 22", treatment: "Sans · 400 · primary text", classes: "text-md leading-md", uses: "Agent messages, explanations" },
	{ name: "Name or value", sample: "checkout--empty · 390 × 844", size: "12 / 18", treatment: "Mono · 400 · primary or secondary text", classes: "font-mono text-sm leading-sm", uses: "Frame names, paths, dimensions" },
	{ name: "Supporting detail", sample: "4 changes · 18s", size: "11 / 16", treatment: "Mono · 400 · secondary text", classes: "font-mono text-xs text-muted leading-xs", uses: "Counts, timestamps, status" },
	{ name: "Panel title", sample: "Properties", size: "14 / 22", treatment: "Sans · 500 · primary text", classes: "font-medium text-md leading-md", uses: "Settings, dialogs, panel headings" },
	{ name: "Page title", sample: "Your projects", size: "28 / 36", treatment: "Sans · 500 · tight tracking", classes: "font-medium [font-size:var(--study-display-size)] [line-height:var(--study-display-leading)] tracking-tight", uses: "Home and full-page introductions" },
] as const;

export function TypeRoles() {
	return (
		<div className="type-study h-full bg-bg px-12 py-10 font-sans text-text antialiased [font-synthesis:none]">
			<header className="mb-8 flex items-start justify-between gap-16">
				<div>
					<h1 className="mb-3 font-medium text-lg leading-lg">Keep the identity. Make the rules clearer.</h1>
					<p className="max-w-[750px] text-md text-muted leading-md">The app has type tokens already. The missing step is a small set of complete text styles that every surface uses. These are proposed roles, ready to compare in the frames below.</p>
				</div>
				<p className="max-w-[290px] text-base text-muted leading-base">Recommendation: Instrument Sans for the app and site. Fragment Mono for names and values. The site keeps its own larger type scale.</p>
			</header>
			<div className="mb-7 grid grid-cols-3 gap-8 border-border border-y py-6">
				{[
					{ name: "Familjen Grotesk", where: "Current app", cls: "font-sans" },
					{ name: "Instrument Sans", where: "Current landing page", cls: "type-family-brand" },
					{ name: "Fragment Mono", where: "Names, paths and values", cls: "type-family-mono" },
				].map((font) => (
					<div key={font.name}>
						<p className={cn("mb-3 text-lg leading-lg", font.cls)}>A canvas for working things out.</p>
						<p className={cn("mb-4 text-base leading-base", font.cls)}>Åäö · Il1 · O0 · cart--empty</p>
						<p className="text-base">{font.name}</p><p className="mt-1 text-sm text-muted">{font.where}</p>
					</div>
				))}
			</div>
			<div className="mb-6 flex items-center justify-between gap-5 border-border border-b pb-6 text-base">
				<span>Primitives <span className="text-muted">· font, size, colour</span></span>
				<span className="text-muted" aria-hidden="true">→</span>
				<span>Text roles <span className="text-muted">· control, message, detail</span></span>
				<span className="text-muted" aria-hidden="true">→</span>
				<span>Components <span className="text-muted">· tab, field, rail</span></span>
				<span className="text-muted" aria-hidden="true">→</span>
				<span>Screens</span>
			</div>
			<div className="type-family-brand">
				{ROLES.map((role) => (
					<div key={role.name} className="grid min-h-[79px] grid-cols-[185px_390px_100px_1fr] items-center gap-6 border-border border-b py-3">
						<p className="text-base">{role.name}</p>
						<p className={role.classes}>{role.sample}</p>
						<p className="font-mono text-xs text-muted">{role.size}</p>
						<div><p className="text-sm text-muted">{role.treatment}</p><p className="mt-1 text-sm">{role.uses}</p></div>
					</div>
				))}
			</div>
			<footer className="mt-7 flex justify-between gap-12 text-base text-muted leading-base">
				<p className="max-w-[590px]">Reuse the existing colour tokens. Supporting text gets the full muted colour; opacity is reserved for actual disabled states. A larger Home heading becomes a named role.</p>
				<p className="max-w-[550px]">Read at 100% in the player. Compare the same column across the three rows: current type, clearer roles, then Instrument Sans. Font choice is still open.</p>
			</footer>
		</div>
	);
}
