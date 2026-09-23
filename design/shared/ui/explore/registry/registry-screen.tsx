import { Fragment, type ReactNode } from "react";
import {
	CATEGORIES,
	COLLECTIONS,
	type Collection,
	type Purpose,
	REGISTRY_ROOT,
	REVISION,
	agentNote,
	collection,
} from "shared/lib/explore/registry/registry-fixture";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import {
	AgentIcon,
	ChevronIcon,
	FolderIcon,
	FrameIcon,
	HandIcon,
	PropertiesIcon,
	SearchIcon,
	SelectIcon,
} from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpoolShell } from "shared/ui/spool/shell";
import { Mini, SpecimenView } from "./specimens";

/**
 * Browsing the official registry inside spool (spool-cloud#185). A disposable
 * discussion prototype: three ways in, each walked from the door to a copy the
 * person owns.
 *
 * - `home`: Home gains a Registry section beside Projects. It lists collections
 *   by category; opening one opens the registry in its own read-only tab, and
 *   "Use in a project" carries the frame to that project's agent.
 * - `tab`: the registry is a card on Home, opened like a project. Its canvas is
 *   the index, and the handoff is a note copied for whichever agent you use.
 * - `rail`: the registry is a row at the foot of every project's pages rail. It
 *   opens inside the project's own tab, so the agent it hands to is right there.
 *
 * - `nav`: the recommendation after the first three. Registry is an item under
 *   Projects on Home that opens the registry tab straight away, and the agent's
 *   log opens it again at whatever the agent took. No handoff button: the person
 *   names an entry in words (spool-cloud#184).
 *
 * Nothing here imports or copies anything. The copy is the agent's work, the
 * person asked for it, and it lands as ordinary files the person owns.
 */

export type Take = "home" | "tab" | "rail" | "nav";

const PURPOSE_HINT: Readonly<Record<Purpose, string>> = {
	"starting point": "Built to be taken and changed.",
	study: "Built to learn from. It may be partial.",
};

/* ------------------------------------------------------------------ */
/* Home                                                                 */
/* ------------------------------------------------------------------ */

/** take `home`: Registry is a second section in Home's own navigation */
export function RegistryHomeSection({ openTarget }: { openTarget: string }) {
	return (
		<SpoolShell canvasControls={false} tabs={["tvärsö", "kaffe"]}>
			<div className="grid h-full grid-cols-[208px_minmax(0,1fr)] overflow-hidden bg-bg">
				<HomeNav current="Registry" />
				<main className="min-w-0 overflow-auto px-[48px] pt-[46px] pb-[48px]">
					<header className="mb-[10px] flex items-center justify-between gap-6">
						<h1 className="type-page font-medium">Registry</h1>
						<div className="flex items-center gap-[13px]">
							<SearchBox placeholder="Search the registry" />
							<button type="button" className="h-[35px] rounded-[7px] border border-border-raised px-[14px] type-control">
								Update to r43
							</button>
						</div>
					</header>
					<p className="mb-[34px] max-w-[560px] text-muted type-body">
						Live examples from spool. Open one to play it and read its source, then have your agent copy what you need
						into a project.
					</p>
					<div className="flex flex-col gap-[34px]">
						{CATEGORIES.map((category) => (
							<section key={category}>
								<h2 className="mb-[14px] text-muted type-value">{category}</h2>
								<div className="grid grid-cols-3 gap-x-[24px] gap-y-[28px]">
									{COLLECTIONS.filter((item) => item.category === category).map((item) => (
										<CollectionCard
											key={item.path}
											item={item}
											target={item.path === "apps/slack" ? openTarget : undefined}
										/>
									))}
								</div>
							</section>
						))}
					</div>
				</main>
			</div>
		</SpoolShell>
	);
}

function CollectionCard({ item, target }: { item: Collection; target?: string | undefined }) {
	const first = item.frames[0];
	if (first === undefined) return null;
	const scale = 400 / first.w;
	return (
		<button type="button" data-go={target} className="group flex min-w-0 flex-col text-left">
			<div className="relative h-[150px] overflow-hidden rounded-[8px] border border-border bg-surface transition-colors group-hover:border-border-raised">
				<Mini w={first.w} h={first.h} scale={scale}>
					<SpecimenView specimen={first.specimen} />
				</Mini>
			</div>
			<div className="mt-[12px] flex items-baseline justify-between gap-3">
				<strong className="truncate type-title font-[500]">{item.name}</strong>
				<PurposeChip purpose={item.purpose} />
			</div>
			<span className="mt-[6px] line-clamp-2 text-muted type-control">{item.line}</span>
		</button>
	);
}

/** take `tab`: the registry is a card on Home, set apart above the projects, opened like one */
export function RegistryHomeCard({ openTarget }: { openTarget: string }) {
	const slack = collection("apps/slack");
	const covers = COLLECTIONS.map((item) => item.frames[0]).filter((frame) => frame !== undefined);
	return (
		<SpoolShell canvasControls={false} tabs={["tvärsö", "kaffe"]}>
			<div className="grid h-full grid-cols-[208px_minmax(0,1fr)] overflow-hidden bg-bg">
				<HomeNav current="Projects" />
				<main className="min-w-0 overflow-hidden px-[48px] pt-[46px]">
					<header className="mb-[31px] flex items-center justify-between gap-6">
						<h1 className="type-page font-medium">Projects</h1>
						<div className="flex items-center gap-[13px]">
							<SearchBox placeholder="Search projects" />
							<button type="button" className="h-[35px] rounded-[7px] border border-border-raised px-[14px] type-control">
								Open…
							</button>
							<button type="button" className="h-[35px] rounded-[7px] bg-text px-[14px] text-bg type-control">
								+ New project…
							</button>
						</div>
					</header>
					<button
						type="button"
						data-go={openTarget}
						className="group mb-[40px] grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-[40px] rounded-[10px] border border-border bg-surface p-[20px] text-left transition-colors hover:border-border-raised"
					>
						<div className="grid h-[220px] grid-cols-2 grid-rows-2 gap-[8px]">
							{covers.map((frame) => (
								<div key={frame.name + frame.specimen} className="overflow-hidden rounded-[6px]">
									<Mini w={frame.w} h={frame.h} scale={250 / frame.w}>
										<SpecimenView specimen={frame.specimen} />
									</Mini>
								</div>
							))}
						</div>
						<div className="flex flex-col">
							<div className="flex items-center gap-[10px]">
								<SpoolMark className="h-[18px] w-[14px] text-thread" />
								<strong className="type-title font-[500]">registry</strong>
							</div>
							<p className="mt-[14px] max-w-[420px] type-body">
								Live examples from spool, organized like any project. Open it to play them and read their source.
							</p>
							<span className="mt-[18px] text-muted type-detail">
								{COLLECTIONS.length} collections · {REVISION} · read-only
							</span>
							<span className="mt-[26px] inline-flex w-fit items-center gap-2 rounded-[7px] border border-border-raised px-[14px] py-[8px] type-control group-hover:bg-raised">
								Open the registry
							</span>
						</div>
					</button>
					<div className="mb-[18px] flex items-center justify-between">
						<span className="text-muted type-value">6 projects</span>
					</div>
					<div className="grid grid-cols-3 gap-x-[24px]">
						{([
							["tvärsö", "coast"],
							["kaffe", "coffee"],
							["fieldnotes", "notes"],
						] as const).map(([name, art]) => (
							<div key={name} className="flex flex-col">
								<div className="h-[160px] overflow-hidden rounded-[8px]">
									<ProjectArtwork kind={art} className="h-full w-full" />
								</div>
								<strong className="mt-[12px] type-title font-[500]">{name}</strong>
							</div>
						))}
					</div>
					<span className="sr-only">{slack.line}</span>
				</main>
			</div>
		</SpoolShell>
	);
}

/** take `nav`: Home as it is, with Registry listed under Projects and opening the tab directly */
export function RegistryHomeNav({ registryTarget }: { registryTarget: string }) {
	return (
		<SpoolShell canvasControls={false} tabs={["tvärsö", "kaffe"]}>
			<div className="grid h-full grid-cols-[208px_minmax(0,1fr)] overflow-hidden bg-bg">
				<HomeNav current="Projects" registryTarget={registryTarget} />
				<main className="min-w-0 overflow-hidden px-[48px] pt-[46px]">
					<header className="mb-[31px] flex items-center justify-between gap-6">
						<h1 className="type-page font-medium">Projects</h1>
						<div className="flex items-center gap-[13px]">
							<SearchBox placeholder="Search projects" />
							<button type="button" className="h-[35px] rounded-[7px] border border-border-raised px-[14px] type-control">
								Open…
							</button>
							<button type="button" className="h-[35px] rounded-[7px] bg-text px-[14px] text-bg type-control">
								+ New project…
							</button>
						</div>
					</header>
					<div className="mb-[18px] text-muted type-value">6 projects</div>
					<div className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
						{([
							["tvärsö", "coast", 24],
							["kaffe", "coffee", 18],
							["fieldnotes", "notes", 12],
							["studio", "studio", 32],
							["dispatch", "slack", 9],
						] as const).map(([name, art, frames]) => (
							<div key={name} className="flex flex-col">
								<div className="h-[200px] overflow-hidden rounded-[8px]">
									<ProjectArtwork kind={art} className="h-full w-full" />
								</div>
								<div className="mt-[12px] flex items-baseline justify-between">
									<strong className="type-title font-[500]">{name}</strong>
									<span className="text-muted type-detail">{frames} frames</span>
								</div>
							</div>
						))}
					</div>
				</main>
			</div>
		</SpoolShell>
	);
}

/** take `nav`, first use: the tab opens at once and fills in when the download lands (spool-cloud#183) */
export function RegistryDownloading() {
	return (
		<SpoolShell activeTab="registry" tabs={["kaffe", "registry"]} canvasControls={false}>
			<div className="flex h-full w-full overflow-hidden bg-bg">
				<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-3 pl-3.5">
						<h1 className="font-semibold type-control">Pages</h1>
					</div>
				</aside>
				<div className="relative flex min-w-0 flex-1 items-center justify-center bg-canvas">
					<div className="flex w-[320px] flex-col gap-3">
						<span className="type-control">Downloading the registry</span>
						<div className="h-[3px] overflow-hidden rounded-full bg-raised">
							<div className="h-full w-[64%] rounded-full bg-thread" />
						</div>
						<span className="text-muted type-detail">
							{REVISION} · 11.8 of 18.4 MB
						</span>
						<span className="text-muted type-control">It stays on this Mac, so its source is readable offline.</span>
					</div>
				</div>
			</div>
		</SpoolShell>
	);
}

function HomeNav({
	current,
	registryTarget,
}: {
	current: "Projects" | "Registry";
	/** take `nav`: Registry is always listed, and pressing it opens the tab */
	registryTarget?: string | undefined;
}) {
	return (
		<aside className="flex h-full flex-col border-border border-r bg-bg px-[16px] pt-[32px] pb-[22px]">
			<div className="mb-[30px] flex h-[32px] items-center gap-[10px] px-[13px] tracking-[-1px] [font:var(--type-mark)]">
				<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
				<span>spool</span>
			</div>
			<nav className="flex flex-col gap-1">
				{(["Projects", "Registry"] as const)
					.filter((item) => item === "Projects" || current === "Registry" || registryTarget !== undefined)
					.map((item) => (
						<button
							type="button"
							key={item}
							data-go={item === "Registry" ? registryTarget : undefined}
							className={cn(
								"flex h-[38px] items-center gap-[12px] rounded-[7px] px-[12px] text-left type-control",
								item === current ? "bg-surface text-text" : "text-muted hover:bg-surface hover:text-text",
							)}
						>
							{item === "Projects" ? <FrameIcon className="h-4 w-4" /> : <RegistryIcon className="h-4 w-4" />}
							{item}
						</button>
					))}
			</nav>
			<span className="mt-auto pl-[12px] text-muted type-detail">On this Mac</span>
		</aside>
	);
}

function SearchBox({ placeholder }: { placeholder: string }) {
	return (
		<span className="flex h-[35px] w-[212px] items-center gap-[10px] rounded-[7px] border border-border px-[11px] text-muted">
			<SearchIcon className="h-3 w-3 shrink-0" />
			<span className="flex-1 type-control">{placeholder}</span>
			<kbd className="type-detail">/</kbd>
		</span>
	);
}

/* ------------------------------------------------------------------ */
/* The registry's canvas                                                */
/* ------------------------------------------------------------------ */

export function RegistryCanvas({
	take,
	page,
	selected,
	handTarget,
	copied = false,
	traced = false,
}: {
	take: Take;
	/** the collection page on screen */
	page: string;
	/** the selected frame's leaf name */
	selected: string;
	/** where the handoff walks: the project's agent, or nowhere for a clipboard copy */
	handTarget?: string | undefined;
	/** take `tab`: the note is on the clipboard */
	copied?: boolean;
	/** take `nav`: opened from kaffe's agent log, at the frame the agent took */
	traced?: boolean;
}) {
	const item = collection(page);
	const frame = `${page}/${selected}`;
	const inProject = take === "rail";
	return (
		<SpoolShell
			activeTab={inProject ? "kaffe" : "registry"}
			tabs={inProject ? ["tvärsö", "kaffe"] : ["kaffe", "registry"]}
			zoom="28%"
		>
			<div className="flex h-full w-full overflow-hidden bg-bg">
				<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
					{inProject ? <ProjectPagesWithRegistry page={page} selected={selected} /> : <RegistryTree page={page} selected={selected} />}
				</aside>
				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
					{inProject ? <ReadOnlyBand /> : null}
					{traced ? <TracedBand /> : null}
					<Field item={item} selected={selected} />
					<ReadOnlyTools />
					{copied ? <CopiedToast frame={frame} purpose={item.purpose} /> : null}
				</div>
				<aside className="flex h-full shrink-0">
					<div className="flex h-full w-[300px] flex-col border-border border-l bg-bg">
						<About item={item} frame={frame} take={take} handTarget={handTarget} copied={copied} />
					</div>
					<div className="flex h-full w-[44px] flex-col items-center gap-1 border-border border-l bg-bg pt-1.5">
						<span className="flex h-8 w-8 items-center justify-center rounded-md bg-raised text-text">
							<PropertiesIcon className="h-4 w-4" />
						</span>
						<span className="flex h-8 w-8 items-center justify-center rounded-md text-muted">
							<AgentIcon className="h-4 w-4" />
						</span>
					</div>
				</aside>
			</div>
		</SpoolShell>
	);
}

/** the registry's own pages rail: the category tree #181 agreed, a revision instead of a page count */
function RegistryTree({ page, selected }: { page: string; selected: string }) {
	return (
		<>
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-3 pl-3.5">
				<h1 className="font-semibold type-control">Pages</h1>
				<span className="text-muted type-detail">
					{REVISION} · read-only
				</span>
			</div>
			<div className="py-2">
				<Tree page={page} selected={selected} depth={0} />
			</div>
		</>
	);
}

function Tree({ page, selected, depth }: { page: string; selected: string; depth: number }) {
	return (
		<>
			{CATEGORIES.map((category) => {
				const open = page.startsWith(`${category}/`);
				const collections = COLLECTIONS.filter((item) => item.category === category);
				return (
					<Fragment key={category}>
						<TreeRow depth={depth} kind="page" open={open} name={category} count={collections.length} />
						{open
							? collections.map((item) => {
									const here = item.path === page;
									return (
										<Fragment key={item.path}>
											<TreeRow
												depth={depth + 1}
												kind="page"
												open={here}
												active={here}
												name={item.name}
												count={item.frames.length}
												purpose={item.purpose}
											/>
											{here
												? item.frames.map((frame) => (
														<TreeRow
															key={frame.name}
															depth={depth + 2}
															kind="frame"
															name={frame.name}
															selected={frame.name === selected}
														/>
													))
												: null}
										</Fragment>
									);
								})
							: null}
					</Fragment>
				);
			})}
		</>
	);
}

function TreeRow({
	depth,
	kind,
	name,
	open = false,
	active = false,
	selected = false,
	count,
	purpose,
}: {
	depth: number;
	kind: "page" | "frame";
	name: string;
	open?: boolean;
	active?: boolean;
	selected?: boolean;
	count?: number;
	purpose?: Purpose | undefined;
}) {
	return (
		<div className={cn("relative flex h-8 items-center pr-3", (active || selected) && "bg-surface")}>
			{active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<span style={{ width: 12 + depth * 14 }} className="shrink-0" />
			<span className="flex w-4 shrink-0 items-center justify-center text-muted">
				{kind === "page" ? <ChevronIcon open={open} className="h-2.5 w-2.5" /> : null}
			</span>
			<span className="ml-1 flex min-w-0 flex-1 items-center gap-2">
				{kind === "page" ? (
					<FolderIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-thread" : "text-muted")} />
				) : (
					<FrameIcon className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-thread" : "text-muted")} />
				)}
				<span className={cn("min-w-0 flex-1 truncate type-value", active || selected ? "text-text" : "text-muted")}>
					{name}
				</span>
			</span>
			{purpose === undefined ? null : <PurposeDot purpose={purpose} />}
			{count === undefined ? null : <span className="ml-2 text-muted type-detail">{count}</span>}
		</div>
	);
}

/** take `rail`: the project's own pages, then the registry docked at the foot and open */
function ProjectPagesWithRegistry({ page, selected }: { page: string; selected: string }) {
	return (
		<>
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-3 pl-3.5">
				<div className="flex items-baseline gap-2">
					<h1 className="font-semibold type-control">Pages</h1>
					<span className="text-muted type-value">2</span>
				</div>
			</div>
			<div className="py-2">
				<TreeRow depth={0} kind="page" name="app" count={3} />
				<TreeRow depth={0} kind="page" name="site" count={2} />
			</div>
			<div className="mt-auto flex min-h-0 flex-col border-border border-t">
				<div className="flex h-10 shrink-0 items-center gap-2 bg-surface pr-3 pl-3.5">
					<ChevronIcon open className="h-2.5 w-2.5 text-muted" />
					<RegistryIcon className="h-3.5 w-3.5 text-thread" />
					<span className="flex-1 type-value">registry</span>
					<span className="text-muted type-detail">{REVISION} · read-only</span>
				</div>
				<div className="pb-2">
					<Tree page={page} selected={selected} depth={1} />
				</div>
			</div>
		</>
	);
}

/** take `nav`: why this tab opened where it did, and the way back */
function TracedBand() {
	return (
		<div className="absolute inset-x-0 top-0 z-10 flex h-9 items-center gap-3 border-border border-b bg-bg/90 px-4 backdrop-blur">
			<AgentIcon className="h-3.5 w-3.5 text-thread" />
			<span className="type-value">from kaffe's agent</span>
			<span className="text-muted type-detail">it copied this frame into slack/orders</span>
			<span className="ml-auto text-muted type-detail">kaffe ↩</span>
		</div>
	);
}

function ReadOnlyBand() {
	return (
		<div className="absolute inset-x-0 top-0 z-10 flex h-9 items-center gap-3 border-border border-b bg-bg/90 px-4 backdrop-blur">
			<RegistryIcon className="h-3.5 w-3.5 text-thread" />
			<span className="type-value">registry</span>
			<span className="text-muted type-detail">read-only · copies land in kaffe</span>
			<span className="ml-auto text-muted type-detail">esc back to kaffe</span>
		</div>
	);
}

/** the collection's frames on the field, live, labelled; selection has no handles because nothing here moves */
function Field({ item, selected }: { item: Collection; selected: string }) {
	const widest = Math.max(...item.frames.map((frame) => frame.w));
	const scale = item.frames.length > 1 ? 360 / widest : 460 / widest;
	return (
		<div className="absolute inset-0 flex items-center justify-center gap-[44px] pb-10">
			{item.frames.map((frame) => {
				const held = frame.name === selected;
				return (
					<div key={frame.name} className="flex flex-col gap-1.5">
						<div className="flex items-center gap-1.5 type-value">
							<span className={held ? "text-thread" : "text-muted"}>{frame.name}</span>
							{held ? (
								<span className="ml-auto flex items-center gap-1 text-muted type-detail">
									<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
										<path d="M2 1.2 8.4 5 2 8.8Z" />
									</svg>
									play
								</span>
							) : null}
						</div>
						<div className="relative">
							<Mini w={frame.w} h={frame.h} scale={scale}>
								<SpecimenView specimen={frame.specimen} />
							</Mini>
							{held ? (
								<div className="pointer-events-none absolute -inset-[3px] rounded-[9px] border-[1.5px] border-thread" />
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/** select and hand only: Edit takes elements to change them, and nothing here changes */
function ReadOnlyTools() {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1">
				<span className="flex h-9 w-9 items-center justify-center rounded-md bg-raised text-text">
					<SelectIcon className="h-[18px] w-[18px]" />
				</span>
				<span className="flex h-9 w-9 items-center justify-center rounded-md text-muted">
					<HandIcon className="h-[18px] w-[18px]" />
				</span>
			</div>
		</div>
	);
}

/** the right panel for a registry frame: what it is for, where it lives, what it takes with it, and the one way out */
function About({
	item,
	frame,
	take,
	handTarget,
	copied,
}: {
	item: Collection;
	frame: string;
	take: Take;
	handTarget?: string | undefined;
	copied: boolean;
}) {
	return (
		<>
			<div className="flex h-9 shrink-0 items-center border-border border-b px-3">
				<span className="truncate type-value">{frame}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<Block name="purpose">
					<PurposeChip purpose={item.purpose} />
					<p className="mt-2 type-control">{item.line}</p>
					<p className="mt-2 text-muted type-control">{PURPOSE_HINT[item.purpose]}</p>
				</Block>
				<Block name="uses" reason="followed from its imports">
					<ul className="flex flex-col gap-1.5">
						<li className="truncate type-detail">frames/{frame}/frame.tsx</li>
						{item.uses.map((path) => (
							<li key={path} className="truncate text-muted type-detail">
								{path}
							</li>
						))}
					</ul>
				</Block>
				<Block name="source" reason={REVISION}>
					<span className="block break-all text-muted type-detail">{REGISTRY_ROOT}/design</span>
				</Block>
				{take === "nav" ? null : (
					<div className="mt-auto flex flex-col gap-2 border-border border-t p-3">
						<Handoff take={take} target={handTarget} copied={copied} />
					</div>
				)}
			</div>
		</>
	);
}

function Handoff({ take, target, copied }: { take: Take; target?: string | undefined; copied: boolean }) {
	if (take === "home") {
		return (
			<>
				<button type="button" data-go={target} className="flex h-9 items-center justify-between rounded-md bg-text px-3 text-bg type-control">
					Use in a project
					<span className="type-detail">kaffe ▾</span>
				</button>
				<span className="text-muted type-detail">Opens kaffe's agent with this frame attached.</span>
			</>
		);
	}
	if (take === "tab") {
		return (
			<>
				<button
					type="button"
					data-go={target}
					className="flex h-9 items-center justify-center rounded-md bg-text px-3 text-bg type-control"
				>
					{copied ? "Copied" : "Copy for your agent"}
				</button>
				<span className="text-muted type-detail">Paste it to any agent working in your project.</span>
			</>
		);
	}
	return (
		<>
			<button type="button" data-go={target} className="flex h-9 items-center justify-center gap-2 rounded-md bg-text px-3 text-bg type-control">
				<AgentIcon className="h-3.5 w-3.5" />
				Ask the agent to use it
			</button>
			<span className="text-muted type-detail">The copy lands in kaffe. This one stays as it is.</span>
		</>
	);
}

function CopiedToast({ frame, purpose }: { frame: string; purpose: Purpose }) {
	return (
		<div className="absolute bottom-[84px] left-1/2 z-30 w-[520px] -translate-x-1/2 rounded-lg border border-border-raised bg-bg p-3 animate-toast-in">
			<div className="mb-2 flex items-center justify-between">
				<span className="type-control">Copied for your agent</span>
				<span className="text-muted type-detail">paste it where you work</span>
			</div>
			<pre className="whitespace-pre-wrap rounded-md bg-surface p-2.5 text-muted type-detail">{agentNote(frame, purpose)}</pre>
		</div>
	);
}

function Block({ name, reason, children }: { name: string; reason?: string; children: ReactNode }) {
	return (
		<div className="border-border border-b px-3 py-3">
			<div className="mb-2 flex items-baseline justify-between">
				<span className="text-muted type-detail">{name}</span>
				{reason === undefined ? null : <span className="text-muted type-detail">{reason}</span>}
			</div>
			{children}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* The person's project: the ask and the copy                          */
/* ------------------------------------------------------------------ */

const KAFFE_FRAMES: readonly { screen: CoffeeScreenName; left: number; top: number }[] = [
	{ screen: "menu", left: 40, top: 150 },
	{ screen: "cart", left: 250, top: 150 },
	{ screen: "receipt", left: 460, top: 150 },
];

/**
 * kaffe with its agent open. `ask` is the moment before send: the registry frame
 * rides the composer as a chip, the words are the person's. `copied` is after:
 * the frame is kaffe's now, on its own page, editable like anything else.
 */
export function ProjectAgent({
	take,
	step,
	sendTarget,
	traceTarget,
}: {
	take: Take;
	step: "ask" | "copied";
	sendTarget?: string | undefined;
	/** take `nav`: the log line naming the registry frame opens the registry tab at it */
	traceTarget?: string | undefined;
}) {
	const done = step === "copied";
	const registryFoot: PageRow[] =
		take === "rail" ? [{ name: "registry", frames: ["spool", "vercel", "slack", "shaders"], foot: true, face: <RegistryIcon className="h-3.5 w-3.5" /> }] : [];
	const pages: PageRow[] = [
		{ name: "app", frames: ["menu", "cart", "receipt"], active: !done, open: !done },
		...(done ? [{ name: "slack", frames: ["orders"], active: true, open: true, unseen: { orders: "new" as const } }] : []),
		{ name: "site", frames: ["landing", "pricing"] },
		...registryFoot,
	];
	return (
		<SpoolShell activeTab="kaffe" tabs={take === "rail" ? ["tvärsö", "kaffe"] : ["kaffe", "registry"]} zoom={done ? "34%" : "40%"}>
			<CanvasChrome
				pages={pages}
				selected={done ? "orders" : undefined}
				rail={<AgentPanel done={done} sendTarget={sendTarget} found={take === "nav"} traceTarget={traceTarget} />}
				railWidth={420}
				railLabel="agent"
			>
				{done ? (
					<div className="absolute inset-0 flex items-center justify-center pb-10">
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center gap-1.5 type-value">
								<span className="h-1.5 w-1.5 rounded-full bg-thread" />
								<span className="text-thread">orders</span>
							</div>
							<div className="relative">
								<Mini w={1280} h={800} scale={0.44}>
									<SpecimenView specimen="slack-channel" kaffe />
								</Mini>
								<div className="pointer-events-none absolute -inset-[3px] rounded-[9px] border-[1.5px] border-thread" />
								{["-left-[7px] -top-[7px]", "-right-[7px] -top-[7px]", "-bottom-[7px] -left-[7px]", "-bottom-[7px] -right-[7px]"].map(
									(position) => (
										<span
											key={position}
											className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
										/>
									),
								)}
							</div>
						</div>
					</div>
				) : (
					KAFFE_FRAMES.map((frame) => (
						<div key={frame.screen} className="absolute flex flex-col gap-1.5" style={{ left: frame.left, top: frame.top }}>
							<span className="text-muted type-value">{frame.screen}</span>
							<div className="h-[390px] w-[180px] overflow-hidden rounded-[10px]">
								<div className="h-[520px] w-[240px] origin-top-left scale-75">
									<CoffeeScreen screen={frame.screen} />
								</div>
							</div>
						</div>
					))
				)}
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * take `rail`, before anything is open: kaffe as it always is, with the registry
 * docked at the foot of its pages. Pressing the row opens the registry here.
 */
export function ProjectWithRegistryRow({ openTarget }: { openTarget: string }) {
	const pages: PageRow[] = [
		{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
		{ name: "site", frames: ["landing", "pricing"] },
		{ name: "registry", frames: ["spool", "vercel", "slack", "shaders"], foot: true, face: <RegistryIcon className="h-3.5 w-3.5" /> },
	];
	return (
		<SpoolShell activeTab="kaffe" tabs={["tvärsö", "kaffe"]} zoom="40%">
			<div className="relative h-full">
				<CanvasChrome pages={pages} selected="cart">
					{KAFFE_FRAMES.map((frame) => (
						<div key={frame.screen} className="absolute flex flex-col gap-1.5" style={{ left: frame.left + 60, top: frame.top }}>
							<span className={cn("type-value", frame.screen === "cart" ? "text-thread" : "text-muted")}>{frame.screen}</span>
							<div className="h-[390px] w-[180px] overflow-hidden rounded-[10px]">
								<div className="h-[520px] w-[240px] origin-top-left scale-75">
									<CoffeeScreen screen={frame.screen} />
								</div>
							</div>
						</div>
					))}
				</CanvasChrome>
				<button
					type="button"
					data-go={openTarget}
					aria-label="Open the registry"
					className="absolute bottom-0 left-0 h-12 w-[248px] cursor-pointer"
				/>
			</div>
		</SpoolShell>
	);
}

const ASK = "Start the orders bot from this. Keep Slack's look and use our order data.";

const FOUND_ASK = "Prototype the Slack bot that posts new kaffe orders.";

function AgentPanel({
	done,
	sendTarget,
	found = false,
	traceTarget,
}: {
	done: boolean;
	sendTarget?: string | undefined;
	/** the agent reached for the registry itself; nothing was attached */
	found?: boolean;
	traceTarget?: string | undefined;
}) {
	if (found) {
		return (
			<div className="flex h-full min-h-0 flex-col bg-bg">
				<div className="flex h-11 shrink-0 items-center gap-3 border-border border-b px-4">
					<span className="text-muted">+</span>
					<span className="truncate type-value">prototype the slack bot</span>
				</div>
				<div className="flex min-h-0 flex-1 flex-col justify-end gap-4 px-5 pb-5">
					<div className="border-border-raised border-l-2 pl-3">
						<p className="type-body">{FOUND_ASK}</p>
					</div>
					<div className="flex flex-col gap-2.5 text-muted type-value">
						<LogRow>spool registry</LogRow>
						<button type="button" data-go={traceTarget} className="group flex items-center gap-2.5 text-left">
							<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
								<path d="m1.5 5.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.4" />
							</svg>
							<span>read</span>
							<span className="inline-flex items-center gap-1.5 rounded-xs border border-border-raised px-1.5 py-[1px] text-text group-hover:border-thread">
								<RegistryIcon className="h-3 w-3 text-thread" />
								apps/slack/channel
								<span className="text-muted">↗</span>
							</span>
						</button>
						<LogRow>copy 4 files into shared/ui/slack</LogRow>
						<LogRow>write slack/orders</LogRow>
					</div>
					<p className="type-body">
						I started from the registry's Slack channel so the bot looks like Slack. slack/orders posts kaffe orders
						from the sample data; the theme, message row and data sit beside it in shared/ui/slack.
					</p>
				</div>
				<div className="border-border border-t p-4">
					<div className="rounded-lg border border-border-raised bg-surface p-3">
						<p className="min-h-[48px] text-muted type-body">say what to change</p>
					</div>
					<div className="mt-2 text-muted type-detail">Opus · high</div>
				</div>
			</div>
		);
	}
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-11 shrink-0 items-center gap-3 border-border border-b px-4">
				<span className="text-muted">+</span>
				<span className="truncate type-value">{done ? "start the orders bot from this" : "new conversation"}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col justify-end gap-4 px-5 pb-5">
				{done ? (
					<>
						<div className="border-border-raised border-l-2 pl-3">
							<p className="type-body">{ASK}</p>
							<span className="mt-1 block text-muted type-value">registry · apps/slack/channel</span>
						</div>
						<div className="flex flex-col gap-2.5 text-muted type-value">
							<LogRow>read apps/slack/channel</LogRow>
							<LogRow>copy 4 files into shared/ui/slack</LogRow>
							<LogRow>write slack/orders</LogRow>
						</div>
						<p className="type-body">
							slack/orders is in kaffe now, with Slack's theme, the message row and sample data beside it in
							shared/ui/slack. I swapped the sample messages for kaffe orders. The registry's copy is unchanged.
						</p>
					</>
				) : (
					<p className="text-muted type-control">Ask about kaffe, or about the frame you attached.</p>
				)}
			</div>
			<div className="border-border border-t p-4">
				<div className="rounded-lg border border-border-raised bg-surface p-3">
					{done ? null : (
						<span className="mb-2 inline-flex items-center gap-2 rounded-md border border-border-raised px-2 py-1 type-value">
							<RegistryIcon className="h-3 w-3 text-thread" />
							registry · apps/slack/channel
							<span className="text-muted">×</span>
						</span>
					)}
					<p className={cn("min-h-[48px] type-body", done ? "text-muted" : "text-text")}>
						{done ? "say what to change" : ASK}
						{done ? null : <span className="ml-0.5 inline-block h-[1.1em] w-px translate-y-[3px] bg-text" />}
					</p>
				</div>
				<div className="mt-2 flex items-center justify-between text-muted type-detail">
					<span>Opus · high</span>
					{done ? null : (
						<button type="button" data-go={sendTarget} className="rounded-xs border border-border-raised px-2 py-[3px] text-text">
							↵ send
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

function LogRow({ children }: { children: ReactNode }) {
	return (
		<span className="flex items-center gap-2.5">
			<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
				<path d="m1.5 5.2 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.4" />
			</svg>
			{children}
		</span>
	);
}

/* ------------------------------------------------------------------ */
/* Marks                                                                */
/* ------------------------------------------------------------------ */

/** what an entry is for, in the machine's own register */
export function PurposeChip({ purpose }: { purpose: Purpose }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 rounded-xs px-1.5 py-[2px] type-detail",
				purpose === "starting point" ? "bg-raised text-text" : "border border-border-raised text-muted",
			)}
		>
			<PurposeDot purpose={purpose} />
			{purpose}
		</span>
	);
}

/** filled for something to take and change, hollow for something to learn from */
function PurposeDot({ purpose }: { purpose: Purpose }) {
	return (
		<span
			aria-label={purpose}
			className={cn(
				"h-1.5 w-1.5 shrink-0 rounded-full",
				purpose === "starting point" ? "bg-text" : "border border-muted",
			)}
		/>
	);
}

/** a stack of pages: the registry's face wherever it appears as a row */
export function RegistryIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect x="2.5" y="5" width="11" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
			<path d="M4.5 3h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}
