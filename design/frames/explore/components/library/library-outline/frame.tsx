import { cn } from "shared/lib/utils";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { INK, LINE, MUTED, PAPER } from "shared/ui/demo/tvarso-checkout";
import {
	Chip,
	ICONS,
	type LibFile,
	type LibPart,
	LibraryFace,
	Strip,
	TOKEN_COUNT,
	TVARSO_FILES,
	TVARSO_PAGES,
	TVARSO_PARTS,
	TVARSO_TOKENS,
	type Token,
	type TokenGroup,
	isSolo,
} from "shared/ui/demo/tvarso-library";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * Shape C read as a page: **the component is the unit and the file is the
 * grouping** ([spool-cloud#29](https://github.com/liamvinberg/spool-cloud/issues/29)).
 *
 * The library is one ruled column in folder order, which is the order the
 * project already has, so there is no second sort to teach. A file that exports
 * one component has no heading of its own: the component takes the row and
 * carries `button.tsx` under its name, because a heading with one child under it
 * is a heading nobody needs. A file that exports several opens, and its members
 * are rows on a spine under it — the same tree the pages rail draws, pointed at
 * exports instead of frames.
 *
 * Everything per-component sits in the row: the specimen, the count, and on the
 * row under the cursor the frames that render it and the arrow that goes there.
 * `icons.tsx` proves the rule rather than breaking it: ten members, ten counts,
 * three to a line, because a 20px glyph does not need a 40px row. Row height
 * follows the component.
 *
 * `tokens.css` is the second column and not a footnote. It is a file in the same
 * folder, so it is read the same way: a group, its members, a count each of the
 * components that read them.
 *
 * The right rail is off. There is nothing on this page to inspect the way a
 * frame is inspected, and the column it would eat is the column the tokens live
 * in.
 */

/* the row under the cursor, so the frame shows what a row does rather than saying it */
const LIT = "Button";

const PAGES: readonly PageRow[] = [
	...TVARSO_PAGES.map((page) => ({ name: page.name, frames: page.frames })),
	{
		name: "library",
		frames: TVARSO_FILES.map((file) => file.file).concat("tokens.css"),
		active: true,
		open: true,
		face: <LibraryFace />,
	},
];

export default function LibraryOutlineFrame() {
	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom="100%">
			<CanvasChrome pages={PAGES} tool="none" rail={null} railWidth={0}>
				<div className="flex h-full w-full gap-10 overflow-clip px-8 pt-5">
					<div className="flex min-w-0 flex-1 flex-col">
						<Head />
						<div className="flex flex-col pt-3">
							{TVARSO_FILES.map((file) => (
								<FileBlock key={file.file} file={file} />
							))}
						</div>
					</div>
					<Tokens />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

function Head() {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline gap-3">
				<h1 className="font-mono text-md text-text leading-md">src/ui</h1>
				<span className="font-mono text-2xs text-muted/50 leading-3">
					{TVARSO_FILES.length + 1} files · {TVARSO_PARTS} components · {TOKEN_COUNT} tokens
				</span>
			</div>
			<p className="text-base text-muted leading-base">
				spool reads this page off the folder. Every row is one component, and the count beside it is how many
				frames render that one.
			</p>
		</div>
	);
}

/* ---------- a file ---------- */

function FileBlock({ file }: { file: LibFile }) {
	if (isSolo(file)) {
		const part = file.parts[0]!;
		return <PartRow part={part} file={file.file} />;
	}
	return (
		<section className="flex flex-col">
			<FileHead file={file} />
			<div className="relative">
				{/* the spine the pages rail already draws, pointed at exports */}
				<span className="absolute top-0 bottom-1.5 left-[6px] w-px bg-border-raised" />
				{file.file === "icons.tsx" ? <IconGrid /> : (
					file.parts.map((part) => <PartRow key={part.name} part={part} member />)
				)}
			</div>
		</section>
	);
}

function FileHead({ file }: { file: LibFile }) {
	return (
		<div className="flex items-baseline gap-3 border-border/70 border-t pt-2 pb-1.5">
			<Caret />
			<span className="font-mono text-base text-text leading-base">{file.file}</span>
			<span className="min-w-0 flex-1 truncate text-sm text-muted/55 leading-sm">{file.note}</span>
			<span className="font-mono text-2xs text-muted/45 leading-3">{file.parts.length} components</span>
		</div>
	);
}

function Caret() {
	return (
		<svg viewBox="0 0 10 10" className="h-2.5 w-2.5 shrink-0 text-muted" fill="none" aria-hidden="true">
			<path d="m1.5 3.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/* ---------- a component ---------- */

function PartRow({ part, file, member = false }: { part: LibPart; file?: string; member?: boolean }) {
	const lit = part.name === LIT;
	return (
		<div
			className={cn(
				"relative flex items-center gap-3.5 py-1",
				member ? "pl-[22px]" : "border-border/70 border-t",
				lit && "bg-surface",
			)}
		>
			{lit ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			{member ? <span className="absolute top-1/2 left-[6px] h-px w-2.5 bg-border-raised" /> : null}
			<Strip part={part} width={156} height={30} className={member ? "ml-1" : "ml-2"} />
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate font-mono text-base text-text leading-base">{part.name}</span>
				{file === undefined ? null : (
					<span className="truncate font-mono text-2xs text-muted/40 leading-3">{file}</span>
				)}
			</div>
			<div className="ml-auto flex shrink-0 items-center gap-4 pr-2">
				{lit ? <Rendered part={part} /> : null}
				<span className="w-[62px] text-right font-mono text-2xs text-muted/60 leading-3">
					{part.frames} frames
				</span>
				<GoTick lit={lit} />
			</div>
		</div>
	);
}

/** where the lit row says what its number is made of, and offers to go there */
function Rendered({ part }: { part: LibPart }) {
	const shown = part.used.slice(0, 3);
	const rest = part.frames - shown.length;
	return (
		<span className="truncate font-mono text-2xs text-muted/70 leading-3">
			{shown.join(" · ")}
			{rest > 0 ? <span className="text-muted/35"> +{rest}</span> : null}
		</span>
	);
}

/** the canvas's own edge, one row long: press it and the frame that renders this opens */
function GoTick({ lit }: { lit: boolean }) {
	if (!lit) return <span aria-hidden="true" className="h-2 w-2.5 shrink-0" />;
	return (
		<svg viewBox="0 0 10 8" className="h-2 w-2.5 shrink-0 text-thread" fill="none" aria-hidden="true">
			<path d="M0.5 4h6" stroke="currentColor" strokeWidth="1.5" />
			<path d="m9.5 4-3-1.8v3.6Z" fill="currentColor" />
		</svg>
	);
}

/**
 * The family, three members to a line.
 *
 * A glyph is 20px and a row built for a card wastes forty of them. The counts
 * still belong to the member, which is the whole claim: `ChevronIcon` is in
 * eleven frames and `WalletIcon` is in two, and no number here is `icons.tsx`'s.
 */
function IconGrid() {
	return (
		<div className="grid grid-cols-3 gap-x-7 pt-1 pb-1 pl-[22px]">
			{ICONS.map((icon) => (
				<div key={icon.name} className="flex h-[26px] items-center gap-3">
					<Chip width={30} height={22} radius={4} className="justify-center">
						<span style={{ color: INK }}>
							<icon.Icon className="h-[15px] w-[15px]" />
						</span>
					</Chip>
					<span className="min-w-0 flex-1 truncate font-mono text-sm text-text/90 leading-sm">{icon.name}</span>
					<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{icon.frames}</span>
				</div>
			))}
		</div>
	);
}

/* ---------- tokens.css ---------- */

function Tokens() {
	return (
		<aside className="flex w-[344px] shrink-0 flex-col border-border border-l pl-9">
			<div className="flex flex-col gap-1.5">
				<div className="flex items-baseline gap-3">
					<h2 className="font-mono text-md text-text leading-md">tokens.css</h2>
					<span className="font-mono text-2xs text-muted/50 leading-3">{TOKEN_COUNT} tokens</span>
				</div>
				<p className="text-base text-muted leading-base">The sheet every component up there reads.</p>
			</div>
			<div className="flex flex-col gap-5 pt-5">
				{TVARSO_TOKENS.map((group) => (
					<TokenBlock key={group.name} group={group} />
				))}
			</div>
		</aside>
	);
}

function TokenBlock({ group }: { group: TokenGroup }) {
	return (
		<section className="flex flex-col">
			<div className="flex items-baseline justify-between border-border/70 border-b pb-1.5">
				<span className="font-mono text-sm text-text leading-sm">{group.name}</span>
				<span className="font-mono text-2xs text-muted/40 leading-3">{group.tokens.length}</span>
			</div>
			{group.tokens.map((token) => (
				<TokenRow key={token.name} token={token} kind={group.kind} />
			))}
		</section>
	);
}

function TokenRow({ token, kind }: { token: Token; kind: TokenGroup["kind"] }) {
	return (
		<div className="flex items-center gap-3 pt-2">
			{kind === "colour" ? (
				<span
					className="h-[22px] w-[22px] shrink-0 rounded-[5px] border border-border-raised"
					style={{ background: token.swatch }}
				/>
			) : kind === "radius" ? (
				/* one corner at its true radius: a 14px round on a 22px box is a circle,
				   and a circle says nothing about 14 */
				<span
					className="h-[22px] w-[22px] shrink-0 border"
					style={{
						background: PAPER,
						borderColor: LINE,
						borderRadius: `${Math.min(22, token.radius ?? 4)}px 0 0 0`,
					}}
				/>
			) : kind === "space" ? (
				/* the gap itself, at true size, between the two things it would be between */
				<Chip width={72} height={22} className="justify-start px-2">
					<span className="flex items-center" style={{ gap: token.gap }}>
						<span className="h-3 w-[5px] rounded-[1px]" style={{ background: MUTED }} />
						<span className="h-3 w-[5px] rounded-[1px]" style={{ background: MUTED }} />
					</span>
				</Chip>
			) : (
				<Chip width={128} height={26} className="px-2">
					<span
						className="truncate font-[Instrument_Sans] antialiased"
						style={{ color: INK, fontSize: sampleSize(token), lineHeight: 1 }}
					>
						{token.sample}
					</span>
				</Chip>
			)}
			<span className="min-w-0 flex-1 truncate font-mono text-sm text-text/90 leading-sm">{token.name}</span>
			<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{token.value}</span>
			<span className="w-6 shrink-0 text-right font-mono text-2xs text-muted/60 leading-3">{token.used}</span>
		</div>
	);
}

function sampleSize(token: Token): number {
	const parsed = Number.parseInt(token.value, 10);
	return Number.isNaN(parsed) ? 13 : Math.min(15, parsed);
}
