import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-type--ledger. The landing typeset as a printed manual.
 *
 * The argument: the other way to be confident with type is to be exact. So the
 * page shouts once, at the title, and then drops to 15px and stays there for
 * the rest of the document: hanging figures in the margin, a ruled grid, a
 * running head with a folio on every sheet, a plate with a caption, footnotes
 * with markers that resolve, and a colophon at the end. Craft carries it where
 * size does most of the work elsewhere.
 *
 * The two registers get two columns and hold them for the whole document: the
 * left column is a person talking, sentence case, 15/25; the right column is
 * what the machine prints, mono, lowercase, verbatim, hung off its own rule.
 * A reader can run the right column alone and end up with spool installed.
 *
 * Three sheets, each one viewport tall at the top edge so the document turns
 * over rather than scrolls continuously: the title, the five steps, the plate
 * and the colophon.
 */

const PAD_X = 96;

/* ---------- the ruled furniture ---------- */

function RunningHead({ folio, title }: { folio: string; title: string }) {
	return (
		<div className="shrink-0">
			<div className="flex items-baseline justify-between font-mono text-[12px] text-muted">
				<span className="flex items-center gap-2">
					<SpoolMark className="h-3 w-3 text-thread" title="spool" />
					spool.page
				</span>
				<span className="text-text">{title}</span>
				<span className="tabular-nums">{folio}</span>
			</div>
			<div className="mt-3 h-px w-full bg-border" />
		</div>
	);
}

function Sheet({
	folio,
	title,
	children,
	tall,
}: {
	folio: string;
	title: string;
	children: React.ReactNode;
	tall?: boolean;
}) {
	return (
		<section
			className="flex w-full flex-col"
			style={{
				minHeight: tall === true ? undefined : 900,
				paddingLeft: PAD_X,
				paddingRight: PAD_X,
				paddingTop: 44,
				paddingBottom: 44,
			}}
		>
			<RunningHead folio={folio} title={title} />
			{children}
		</section>
	);
}

/* ---------- sheet two: the five steps ---------- */

interface Step {
	n: string;
	head: string;
	body: string;
	/** the machine column, verbatim lowercase, one line per line */
	lines: readonly string[];
}

const STEPS: readonly Step[] = [
	{
		n: "01",
		head: "Install the command",
		body: "One global install and spool exists everywhere on the machine. Node 22 and up; the canvas wants Chrome, because WebKit renders a transformed iframe blurry.",
		lines: ["~ $ npm i -g spool.page", "~ $ spool --version"],
	},
	{
		n: "02",
		head: "Or take the Mac app",
		body: "The same spool, in a window instead of a browser tab. One DMG, drag it to Applications, open it. It carries the daemon with it, so there is a single thing to install.",
		lines: ["spool.dmg → /applications", "⌘space spool"],
	},
	{
		n: "03",
		head: "The first run is an empty canvas",
		body: "A window with a rail down the left and a field to the right of it, and nothing in either one. That is the correct first screen. Everything after this is you pointing it somewhere.",
		lines: ["~ $ spool", "listening on localhost:7766", "no projects yet"],
	},
	{
		n: "04",
		head: "Press + and hand it a folder",
		body: "Any folder on your disk becomes a project. spool scaffolds design/ beside your source, registers the root and opens its tab. The folder stays yours; git tracks the whole thing.",
		lines: ["~/kaffe $ spool init", "~/kaffe/design/frames/", "~/kaffe/design/shared/"],
	},
	{
		n: "05",
		head: "Open the next one",
		body: "Projects sit side by side as tabs in one window, each with its own canvas and its own frames. Moving between them is a click, and the daemon keeps all of them warm.",
		lines: ["spool · kaffe · tidemark"],
	},
];

/** the contents, printed on the title sheet. lowercase, because it names machine steps. */
const CONTENTS: readonly { n: string; what: string; folio: string }[] = [
	{ n: "01", what: "npm i -g spool.page", folio: "02" },
	{ n: "02", what: "spool.dmg", folio: "02" },
	{ n: "03", what: "spool", folio: "02" },
	{ n: "04", what: "+ · design/", folio: "02" },
	{ n: "05", what: "tabs", folio: "02" },
	{ n: "pl.", what: "get-started.mp4", folio: "03" },
	{ n: "mit", what: "github.com/liamvinberg/spool", folio: "03" },
];

function StepRow({ step }: { step: Step }) {
	return (
		<div className="grid grid-cols-[52px_468px_1fr] gap-x-14 border-border border-t py-8">
			<span className="pt-[3px] font-mono text-[13px] text-thread tabular-nums">{step.n}</span>
			<div>
				<h3 className="font-semibold text-[21px] leading-[26px] tracking-[-0.015em]">{step.head}</h3>
				<p className="mt-2.5 text-[15px] text-muted leading-[25px]">{step.body}</p>
			</div>
			<div className="border-border-raised border-l pl-6 font-mono text-[14px] leading-[26px]">
				{step.lines.map((l, i) => (
					<div key={l} className={i === 0 ? "text-text" : "text-muted"}>
						{l}
					</div>
				))}
			</div>
		</div>
	);
}

/* ---------- the page ---------- */

export default function SiteTypeLedger() {
	return (
		<div className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg font-sans text-text antialiased [font-synthesis:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
			{/* sheet one: the one loud thing on the whole document */}
			<Sheet folio="01" title="Getting started">
				<div className="flex flex-1 flex-col justify-center">
					<div className="grid grid-cols-[1fr_356px] gap-x-14">
						<h1 className="font-semibold text-[118px] leading-[0.9] tracking-[-0.045em]">
							<span className="block">Everything</span>
							<span className="block">it takes to</span>
							<span className="block">start.</span>
						</h1>
						{/* the title sheet carries the contents, the way a manual's does */}
						<div className="pt-[14px] font-mono text-[13px] leading-[30px]">
							{CONTENTS.map((c) => (
								<div key={c.n} className="flex items-baseline gap-5 border-border border-b py-[7px]">
									<span className="w-9 shrink-0 text-thread tabular-nums">{c.n}</span>
									<span className="flex-1 text-muted">{c.what}</span>
									<span className="text-text tabular-nums">{c.folio}</span>
								</div>
							))}
						</div>
					</div>
					<div className="mt-14 grid grid-cols-[468px_1fr] gap-x-14">
						<p className="text-[17px] text-muted leading-[27px]">
							spool is a canvas that runs the code your agent writes. It lives inside your repo as a{" "}
							<span className="font-mono text-[15px] text-text">design/</span> folder, it runs on your own
							machine, and this page is the part before any of that: install, open, point it at a folder.
						</p>
						<p className="text-[17px] text-muted leading-[27px]">
							Five steps follow, on the sheet after this one. The left column is a person talking. The right
							column is what the machine prints, so you can read that one alone and end up with spool
							installed.<sup className="ml-[2px] text-[11px] text-thread">†</sup>
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-baseline justify-between border-border border-t pt-4 font-mono text-[13px] text-muted">
					<span>node 22+ · chrome · macos and linux, windows via wsl</span>
					<span>npm i -g spool.page</span>
				</div>
			</Sheet>

			{/* sheet two: the manual proper */}
			<Sheet folio="02" title="The five steps" tall>
				<div className="pt-12">
					{STEPS.map((s) => (
						<StepRow key={s.n} step={s} />
					))}
					<div className="border-border border-t" />
				</div>
			</Sheet>

			{/* sheet three: the plate, the notes, the colophon */}
			<Sheet folio="03" title="Plate and colophon" tall>
				<div className="pt-12 pb-16">
					<div className="group relative h-[386px] w-full border border-border">
						<button
							type="button"
							className="absolute inset-0 flex items-center justify-center gap-4 font-mono text-[15px] text-muted transition-colors duration-200 hover:text-text"
						>
							<span className="flex h-11 w-11 items-center justify-center rounded-full border border-border-raised text-thread transition-colors duration-200 group-hover:border-thread">
								<span className="ml-[3px] block text-[13px] leading-none">▶</span>
							</span>
							get-started.mp4
						</button>
						<span className="absolute right-5 bottom-4 font-mono text-[13px] text-muted tabular-nums">06:12</span>
					</div>
					<div className="mt-4 grid grid-cols-[52px_468px_1fr] gap-x-14">
						<span className="font-mono text-[13px] text-thread">pl. 1</span>
						<p className="text-[15px] text-muted leading-[25px]">
							An empty folder to a walkable flow, start to finish, at the speed it actually happens.
						</p>
						<span className="font-mono text-[14px] text-muted">06:12 · no narration</span>
					</div>

					<div className="mt-16 grid grid-cols-[52px_468px_1fr] gap-x-14 border-border border-t pt-8">
						<span className="font-mono text-[13px] text-thread">†</span>
						<p className="text-[15px] text-muted leading-[25px]">
							This site was designed in spool. Its own{" "}
							<span className="font-mono text-[14px] text-text">design/</span> folder holds 142 frames across
							twelve pages, and the sheet you are reading is one of them.
						</p>
						<span className="font-mono text-[14px] text-muted">design/frames/site/site-type--ledger/</span>
					</div>

					<div className="mt-14 grid grid-cols-[52px_468px_1fr] gap-x-14 border-border border-t pt-8">
						<span className="font-mono text-[13px] text-thread">mit</span>
						<div>
							<h3 className="font-semibold text-[21px] leading-[26px] tracking-[-0.015em]">
								Fork it, rework it, rename it, ship it.
							</h3>
							<p className="mt-2.5 text-[15px] text-muted leading-[25px]">
								I made this for myself. It's MIT, so make it yours. Third-party components keep their own
								licenses and they are listed in the repo.
							</p>
						</div>
						<span className="font-mono text-[14px] text-text">github.com/liamvinberg/spool</span>
					</div>
				</div>
			</Sheet>
		</div>
	);
}
