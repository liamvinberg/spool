import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import {
	BARE,
	ComponentFace,
	DEMOS,
	FILES,
	type LibFile,
	PARTS,
	Specimen,
	demosOf,
	fitScale,
} from "shared/ui/explore/components/components";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * An exploration of the components page as a document read top to bottom (#189).
 *
 * The argument: **the folder is already the outline, so the page is one column in
 * folder order and the rail is its index.** A gallery that sorts by anything else
 * has to teach you a second order; this one has none to teach. A file is a heading
 * with a rule under it, and what it exports comes next, either drawn or named.
 *
 * The rail marking: the row sits **in the page list, in its own alphabetical place,
 * and it is open**. Nothing is pinned and nothing is docked, because the claim here
 * is that a components page is a page — you scroll to it, it sorts with the rest,
 * and the only thing that says it is different is the face in the folder's slot and
 * what falls out when it opens: file names rather than frame names. That is the
 * whole marking, and its cost is drawn rather than argued: thirty-five children push
 * `directing` and `site` off the bottom of a rail that used to hold four rows.
 *
 * A file with no demo keeps its heading and loses only its pictures: the exports are
 * named where the specimens would be, in the same grey, in folder order. So the
 * holes are read in place rather than collected into a list somewhere else, and
 * `coffee-empty-takes` being the first thing on the page is the honest opening.
 */

const SPECIMEN_H = 200;
const SPECIMEN_W = 380;

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"] },
	{
		name: "components",
		frames: FILES.map((file) => file.name),
		active: true,
		open: true,
		face: <ComponentFace />,
	},
	{ name: "directing", frames: [] },
	{ name: "site", frames: [] },
];

export default function SpoolComponentsIndexFrame() {
	return (
		<SpoolShell activeTab="spool" tabs={["kaffe", "spool"]} zoom="100%">
			<CanvasChrome pages={PAGES} tool="none">
				<div className="h-full w-full overflow-clip px-6 pt-6">
					<Head />
					<div className="flex flex-col gap-7 pt-7">
						{FILES.map((file) => (
							<Section key={file.name} file={file} />
						))}
					</div>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

function Head() {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline gap-3">
				<h1 className="font-mono text-md text-text leading-md">shared/ui</h1>
				<span className="font-mono text-2xs text-muted/50 leading-3">
					{FILES.length} files · {PARTS} parts · {DEMOS.length} demos · {BARE.length} with no demo
				</span>
			</div>
			<p className="text-base text-muted leading-base">
				Read only. spool draws this page from the folder, so nothing on it can be moved.
			</p>
		</div>
	);
}

function Section({ file }: { file: LibFile }) {
	const demos = demosOf(file.name);
	return (
		<section className="flex flex-col gap-3.5">
			<div className="flex items-baseline gap-3 border-border border-b pb-2">
				<span className="font-mono text-sm text-text leading-sm">{file.name}.tsx</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">
					{file.parts.length} {file.parts.length === 1 ? "part" : "parts"}
				</span>
				<span className="ml-auto font-mono text-2xs text-muted/30 leading-3">
					{demos.length === 0 ? "no demo" : `${demos.length} ${demos.length === 1 ? "demo" : "demos"}`}
				</span>
			</div>
			{demos.length === 0 ? (
				<div className="flex flex-wrap gap-x-5 gap-y-1">
					{file.parts.map((part) => (
						<span key={part} className="font-mono text-sm text-muted/35 leading-sm">
							{part}
						</span>
					))}
				</div>
			) : (
				<div className="flex flex-wrap items-end gap-x-9 gap-y-7">
					{demos.map((demo, index) => {
						const scale = fitScale(demo, SPECIMEN_W, SPECIMEN_H);
						return (
							<div
								key={`${demo.of}-${index}`}
								className="flex flex-col gap-2.5"
								style={{ width: Math.max(124, Math.round(demo.w * scale)) }}
							>
								<Specimen
									demo={demo}
									box={SPECIMEN_W}
									tall={Math.min(SPECIMEN_H, demo.h)}
									readout="off"
								/>
								{/* the caption stacks rather than shares a line: a reading column is
								    as wide as its specimen, and a specimen here is sometimes 8px */}
								<div className="flex min-w-0 flex-col gap-1 border-border border-t pt-2">
									<span className="truncate font-mono text-sm text-text leading-sm">{demo.of}</span>
									<span className="truncate font-mono text-2xs text-muted/50 leading-3">
										{demo.example}
										{scale === 1 ? null : <span className="text-muted/30"> · {Math.round(scale * 100)}%</span>}
									</span>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}
