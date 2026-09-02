import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { BARE, ComponentFace, DEMOS, type Demo, FILES, PARTS, Specimen } from "shared/ui/spool-components";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * An exploration of the components page as a contact sheet (#189).
 *
 * The argument: **a component is a card, and the file it came from is a line of
 * type on it.** This library is fifteen files with a demo beside them and thirteen
 * of those files hold exactly one, so a section band per file would have drawn
 * thirteen bands over thirteen single cards and called it grouping. The file goes
 * on the card instead, where it costs one 10px line and still sorts the sheet.
 *
 * The rail marking: the row is **lifted out of the page list and pinned above it**,
 * with a hairline between. Every row under that line is a folder on disk you can
 * add a frame to; this one is not, and the rule is the sentence saying so. It keeps
 * the folder's slot for a face of its own — two boxes, one behind the other — and
 * it takes the thread spine when it is the page on screen, because it *is* the page
 * on screen and lying about that to look synthetic would cost more than it buys.
 *
 * What has no demo never enters the gallery. It gets a manifest docked along the
 * bottom instead: twenty names, always on screen, never scrolled past, saying what
 * the sheet above is not showing you and what one file would cost to fix it. A
 * placeholder in the grid would have been twenty holes to scroll through; a line at
 * the bottom is the same fact in one glance.
 */

const PAGES: readonly PageRow[] = [
	{
		name: "components",
		frames: FILES.map((file) => file.name),
		active: true,
		face: <ComponentFace />,
		ruled: true,
	},
	{ name: "app", frames: ["menu", "cart", "receipt"] },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const COLS = 4;
const GUTTER = 16;
const CARD = (892 - 48 - GUTTER * (COLS - 1)) / COLS;
const WELL = 108;

export default function SpoolComponentsSheetFrame() {
	return (
		<SpoolShell activeTab="spool" tabs={["kaffe", "spool"]} zoom="100%">
			<CanvasChrome pages={PAGES} tool="none">
				<div className="flex h-full w-full flex-col">
					<Band />
					<div className="min-h-0 flex-1 overflow-clip px-6 pt-5">
						<div className="flex flex-wrap" style={{ gap: `16px ${GUTTER}px` }}>
							{DEMOS.map((demo, index) => (
								<Card key={`${demo.file}-${index}`} demo={demo} />
							))}
						</div>
					</div>
					<Manifest />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

function Band() {
	return (
		<div className="flex h-9 shrink-0 items-center gap-3 border-border border-b px-6">
			<span className="font-mono text-sm text-text leading-sm">shared/ui</span>
			<span className="font-mono text-2xs text-muted/50 leading-3">
				{FILES.length} files · {PARTS} parts · {DEMOS.length} demos
			</span>
			<span className="ml-auto font-mono text-2xs text-muted/35 leading-3">read only · laid out by spool</span>
		</div>
	);
}

function Card({ demo }: { demo: Demo }) {
	return (
		<div className="flex flex-col gap-2" style={{ width: CARD }}>
			<div className="rounded-md border border-border bg-bg">
				<Specimen demo={demo} box={CARD - 24} tall={WELL} />
			</div>
			<div className="flex flex-col gap-1 px-0.5">
				<div className="flex min-w-0 items-baseline gap-1.5">
					<span className="shrink-0 font-mono text-sm text-text leading-sm">{demo.of}</span>
					<span className="min-w-0 truncate font-mono text-2xs text-muted/50 leading-3">{demo.example}</span>
				</div>
				<span className="truncate font-mono text-2xs text-muted/30 leading-3">{demo.file}.tsx</span>
			</div>
		</div>
	);
}

function Manifest() {
	return (
		<div className="flex h-[120px] shrink-0 flex-col gap-2 border-border border-t px-6 pt-3">
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-sm text-muted leading-sm">no demo</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{BARE.length}</span>
				<span className="ml-auto font-mono text-2xs text-muted/30 leading-3">
					a demo is a file beside it: shared/ui/&lt;name&gt;.demo.tsx
				</span>
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{BARE.map((file) => (
					<span key={file.name} className="font-mono text-2xs text-muted/45 leading-4">
						{file.name}
						<span className="text-muted/20"> {file.parts.length}</span>
					</span>
				))}
			</div>
		</div>
	);
}
