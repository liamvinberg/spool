import { useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import { SpoolShell } from "shared/ui/spool/shell";
import "./study.css";

export type TypeTake = "today" | "clear" | "instrument";
type Surface = "canvas" | "home";

const TAKES = {
	today: {
		title: "Current type",
		says: "Familjen Grotesk + Fragment Mono. Existing type sizes and contrast, in a fixed sample of the app.",
		foot: "13 / 20 message · 12 / 18 page name · 11 / 16 frame name · 10 / 12 detail",
	},
	clear: {
		title: "Clearer roles",
		says: "Same fonts. Messages get room to read; names and supporting details get a consistent, readable size.",
		foot: "14 / 22 message · 12 / 18 names · 11 / 16 detail · full muted colour for supporting text",
	},
	instrument: {
		title: "The landing page’s font",
		says: "Instrument Sans + Fragment Mono. The same role changes as Clearer roles, with the site’s sans family.",
		foot: "Same sizes and spacing as Clearer roles. Only the app’s sans family changes between these two rows.",
	},
} satisfies Record<TypeTake, { title: string; says: string; foot: string }>;

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt", "cart--empty"], active: true, open: true },
	{ name: "explore", frames: ["checkout", "navigation", "type"] },
	{ name: "site", frames: ["landing", "download"] },
	{ name: "system", frames: ["tokens", "type", "primitives"] },
];

/** The app specimen is copied from the app canvas composition. The transcript is
 * a deterministic fixture using the shipped rail's type treatments. */
function CanvasSample() {
	return (
		<SpoolShell tabs={["spool", "untitled"]} activeTab="spool" zoom="72%">
			<CanvasChrome pages={PAGES} selected="cart" rail={<Conversation />} railWidth={380} railLabel="agent">
				<div className="flex h-full items-center justify-center gap-9 pb-8">
					{(["menu", "cart"] as const).map((name) => (
						<div key={name} className="w-[240px] shrink-0">
							<div className="mb-3 flex items-center justify-between font-mono text-sm text-muted leading-4">
								<span className={cn(name === "cart" && "text-text")}>{name}</span>
								<span className="text-2xs">390 × 844</span>
							</div>
							<div className={cn("type-demo relative h-[520px] w-[240px]", name === "cart" && "outline outline-thread outline-offset-4")}>
								<CoffeeScreen screen={name} />
							</div>
						</div>
					))}
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

function Conversation() {
	const [draft, setDraft] = useState("");
	const [details, setDetails] = useState(false);
	return (
		<div className="flex h-full flex-col bg-bg font-sans text-text">
			<div className="flex h-9 shrink-0 items-center justify-between border-border border-b px-4 text-sm leading-4">
				<span>Make the cart easier to read</span><span className="text-muted" aria-hidden="true">＋</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-7 overflow-auto px-5 py-6">
				<div className="flex flex-col gap-2">
					<p className="type-body">Make the cart easier to scan, and keep the empty state in the same style.</p>
					<span className="type-meta">cart · 2 elements</span>
				</div>
				<div className="flex flex-col gap-3">
					<p className="type-body">The item names now lead each row. Prices stay aligned, with a little more space before the total.</p>
					<button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="flex items-center gap-2 text-left font-mono text-sm leading-4">
						<span className="text-muted" aria-hidden="true">{details ? "⌄" : "›"}</span>
						<span>cart</span><span className="text-muted">edited</span>
					</button>
					{details ? <p className="type-meta pl-4">frame.tsx · item spacing and total weight</p> : null}
					<p className="type-body">The empty state uses the same heading and button styles. You can try both on the canvas.</p>
					<span className="type-meta">2 frames · 4 changes · 18s</span>
				</div>
				<div className="mt-1 flex flex-col gap-2 border-border border-t pt-4">
					<span className="font-medium text-sm leading-sm">A longer name</span>
					<p className="font-mono text-xs text-muted leading-xs">checkout--delivery-instructions</p>
					<p className="type-body text-muted">Åsa’s order is ready. 1 item, 0 extras. The receipt includes the café’s address.</p>
				</div>
			</div>
			<div className="shrink-0 border-border border-t p-4">
				<textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Say what to change" className="type-composer type-body h-24 w-full resize-none rounded-md border border-border-raised bg-surface p-3 text-text outline-none focus:border-muted" />
				<div className="mt-3 flex items-center justify-between"><span className="type-meta">claude · sonnet</span><span className="type-meta">{draft ? "draft" : "ready"}</span></div>
			</div>
		</div>
	);
}

export function TypeStudy({ take, surface }: { take: TypeTake; surface: Surface }) {
	const copy = TAKES[take];
	return (
		<div data-take={take} className="type-study flex h-full flex-col overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
			<header className="flex h-[104px] shrink-0 items-center justify-between gap-8 px-8">
				<div className="flex flex-col gap-2">
					<h1 className="font-medium text-lg leading-lg">{copy.title}</h1>
					<p className="text-base text-muted leading-base">{copy.says}</p>
				</div>
				<span className="shrink-0 text-base text-muted">{surface === "canvas" ? "Canvas + conversation" : "Home + projects"}</span>
			</header>
			<div className="type-app mx-6 min-h-0 flex-1 overflow-hidden rounded-lg border border-border-raised">
				{surface === "canvas" ? <CanvasSample /> : <SpoolHomeScreen />}
			</div>
			<footer className="flex h-[64px] shrink-0 items-center justify-between gap-8 px-8 text-sm text-muted leading-sm">
				<p>{copy.foot}</p><span className="shrink-0">Design study · colours and layout held constant</span>
			</footer>
		</div>
	);
}
