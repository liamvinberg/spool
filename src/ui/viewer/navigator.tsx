import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { DesignFrame } from "../../daemon/design-projection";
import type { Unseen } from "../../daemon/seen";
import { pageChain, pageName, pageParent, ROOT_PAGE } from "../../page-path";
import { saidAgo } from "../../share-view";
import type { Box } from "../canvas/camera";
import { mergeOrder, mergePageTree } from "../canvas/order";
import type { PresenceRoom } from "../canvas/presence";
import { UnseenMark } from "../canvas/unseen-mark";
import { cn } from "../cn";
import { ChevronIcon, FolderIcon, FrameIcon, SearchIcon } from "../icons";
import { TeamMark } from "../teams";
import { isDesktop } from "./phone";
import { PhonePlay } from "./phone-play";
import { address, edits, locate, type ViewerConfig, type ViewerProject } from "./source";
import { PartFaces, type ViewerPresence } from "./viewer-presence";

/** How many pages and frames find lists at most: enough to jump, never the whole project at once. */
const FOUND = { pages: 8, frames: 24 };

/** A save as the navigator's toast tells it: who saved what, and the frame `show` plays. */
export interface NavigatorToast {
	message: string;
	frame: string | null;
}

/**
 * A team canvas on a phone (DEV-161): no spatial canvas, a navigator instead, in spool's own style. Recent is the
 * frames saved to last, who saved each and when; below it, the pages a level at a time with breadcrumbs and
 * frame counts, and the open page's frames as covers; above it all, find over page and frame names. A frame plays
 * from its cover, full screen, and a pull from the right edge brings it back. A teammate's save arrives as a toast.
 *
 * Who is in each part shows beside it (DEV-197): the faces of everyone on the canvas at the top, of whoever is on a
 * page or under it on its row, and of whoever is inside a frame on its cover. This person is seen on the level they
 * are on, and inside the frame they play, with no pointer.
 *
 * The URL follows the level and the played frame as the canvas's does, so back steps up a level or out of play.
 */
export function Navigator({
	config,
	project,
	marks,
	onSeen,
	toast,
	presence,
}: {
	config: ViewerConfig;
	project: ViewerProject;
	marks: ReadonlyMap<string, Unseen>;
	onSeen: (frame: string) => void;
	toast: NavigatorToast | null;
	/** Who else is on the canvas; null where there is no presence. */
	presence: ViewerPresence | null;
}) {
	const { canvas } = project;
	const [where, setWhere] = useState(() => locate(config, new URL(window.location.href)));
	const [query, setQuery] = useState("");
	const tree = useMemo(() => mergePageTree(canvas.order.pages, canvas.pages), [canvas]);
	const known = useMemo(() => new Set(canvas.pages), [canvas.pages]);
	const level = known.has(where.page) ? where.page : ROOT_PAGE;
	const played =
		where.frame !== null && canvas.frames.some((frame) => frame.name === where.frame) ? where.frame : null;

	/** Each page's frames in the rail's order, and how many frames it holds at any depth. */
	const { framesOf, totals } = useMemo(() => {
		const own = new Map<string, DesignFrame[]>();
		for (const frame of canvas.frames) {
			const page = frame.page ?? ROOT_PAGE;
			own.set(page, [...(own.get(page) ?? []), frame]);
		}
		const totals = new Map<string, number>();
		for (const [page, frames] of own)
			for (const holder of [ROOT_PAGE, ...(page === ROOT_PAGE ? [] : pageChain(page))])
				totals.set(holder, (totals.get(holder) ?? 0) + frames.length);
		const framesOf = (page: string): DesignFrame[] => {
			const here = own.get(page) ?? [];
			const byLeaf = new Map(here.map((frame) => [pageName(frame.name), frame]));
			return mergeOrder(
				canvas.order.frames?.[page],
				here.map((frame) => pageName(frame.name)),
			).flatMap((leaf) => byLeaf.get(leaf) ?? []);
		};
		return { framesOf, totals };
	}, [canvas]);

	const go = (next: { page: string; frame: string | null }, how: "push" | "replace" = "push") => {
		const url = address(config, next.page, next.frame);
		if (how === "push") window.history.pushState({ spool: "navigator" }, "", url);
		else window.history.replaceState({ spool: "navigator" }, "", url);
		setWhere(next);
	};
	useEffect(() => {
		const onPop = () => setWhere(locate(config, new URL(window.location.href)));
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [config]);

	const say = presence?.say;
	useEffect(() => {
		say?.({ page: level, pointer: null, pressed: false, dragging: [], inside: played, view: null });
	}, [say, level, played]);
	const room = presence?.room;

	const play = (frame: string) => {
		onSeen(frame);
		go({ page: level, frame });
	};
	const open = (page: string) => {
		setQuery("");
		go({ page, frame: null });
	};

	const found = query.trim().toLowerCase();
	const recent = (project.recent ?? []).filter((each) => canvas.frames.some((frame) => frame.name === each.frame));
	const covers = project.covers ?? {};
	const frameOf = (name: string) => canvas.frames.find((frame) => frame.name === name);

	return (
		<div
			data-navigator=""
			className="fixed inset-0 flex select-none flex-col bg-bg text-text"
			style={{ paddingTop: "env(safe-area-inset-top)" }}
		>
			<header className="flex h-12 shrink-0 items-center gap-2.5 px-4">
				{project.team !== null && <TeamMark team={project.team} size={22} />}
				<span className="min-w-0 truncate type-control">{project.project}</span>
				<span className="ml-auto flex shrink-0 items-center gap-2.5">
					{room !== undefined && <PartFaces room={room} part={() => true} />}
					{!edits(project.role) && <span className="text-muted type-detail">view only</span>}
				</span>
			</header>
			<label className="mx-3 mb-1 flex h-10 shrink-0 items-center gap-2 rounded-md bg-surface px-3">
				<SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={`find in ${project.project}`}
					aria-label="Find a page or a frame"
					className="h-full min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-muted type-value"
					// sixteen pixels or more, or iOS zooms the page in on focus
					style={{ fontSize: 16 }}
				/>
			</label>
			<nav
				aria-label="Pages"
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6"
				style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
			>
				{found !== "" ? (
					<Found
						query={found}
						pages={canvas.pages}
						frames={canvas.frames}
						totals={totals}
						covers={covers}
						onPage={open}
						onFrame={play}
					/>
				) : (
					<>
						{level === ROOT_PAGE && recent.length > 0 && (
							<>
								<Section>recent</Section>
								{recent.map((each) => (
									<Row
										key={each.frame}
										label={`Play ${pageName(each.frame)}`}
										onClick={() => play(each.frame)}
										icon={<Thumb frame={frameOf(each.frame)} cover={covers[each.frame]} />}
									>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="flex min-w-0 items-center gap-1.5 type-value">
												<span className="truncate">{pageName(each.frame)}</span>
												{marks.has(each.frame) && <UnseenMark mark={marks.get(each.frame) ?? "changed"} />}
											</span>
											<span className="truncate text-muted type-detail">
												{each.by} · {saidAgo(each.at)}
												{pageParent(each.frame) !== ROOT_PAGE && ` · ${pageParent(each.frame)}`}
											</span>
										</span>
									</Row>
								))}
							</>
						)}
						<Crumbs project={project.project} level={level} onLevel={open} />
						{(tree.get(level) ?? []).map((page) => (
							<Row
								key={page}
								label={pageName(page)}
								onClick={() => open(page)}
								icon={<FolderIcon className="h-4 w-4 text-muted" />}
							>
								<span className="min-w-0 flex-1 truncate type-value">{pageName(page)}</span>
								{room !== undefined && <PartFaces room={room} part={(mate) => under(mate.state.page, page)} />}
								<span className="text-muted type-detail">{totals.get(page) ?? 0}</span>
								<span className="flex h-2.5 w-2.5 shrink-0 text-muted">
									<ChevronIcon />
								</span>
							</Row>
						))}
						<Covers frames={framesOf(level)} covers={covers} marks={marks} room={room} onPlay={play} />
						{(tree.get(level) ?? []).length === 0 && framesOf(level).length === 0 && (
							<div className="px-4 py-3 text-muted type-detail">nothing on this page yet</div>
						)}
					</>
				)}
			</nav>
			{toast !== null && played === null && (
				<div
					role="status"
					className="fixed inset-x-0 z-20 flex justify-center px-3"
					style={{ bottom: "calc(14px + env(safe-area-inset-bottom))" }}
				>
					<span className="flex h-10 max-w-full animate-[viewer-page-in_160ms_ease-out] items-center gap-2 rounded-md border border-border-raised bg-raised pr-1.5 pl-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] type-detail">
						<span className="min-w-0 truncate">{toast.message}</span>
						{toast.frame !== null && frameOf(toast.frame) !== undefined && (
							<button
								type="button"
								className="shrink-0 cursor-pointer rounded-xs bg-thread/15 px-1.5 py-0.5 text-thread"
								onClick={() => toast.frame !== null && play(toast.frame)}
							>
								show
							</button>
						)}
					</span>
				</div>
			)}
			{played !== null && (
				<PhonePlay
					frames={canvas.frames}
					documentOf={(name) => `${project.frames}${encodeURIComponent(name)}?play`}
					start={played}
					coverOf={(name) => covers[name]}
					spotOf={spotOf}
					onWalked={(frame) => {
						onSeen(frame);
						go({ page: level, frame }, "replace");
					}}
					onClosed={() => go({ page: level, frame: null })}
				/>
			)}
		</div>
	);
}

/** Whether a page is the part named, or inside it. */
function under(page: string, part: string): boolean {
	return page === part || page.startsWith(`${part}/`);
}

/** Where a frame's cover stands in the navigator, when one is in sight. */
function spotOf(frame: string): Box | null {
	for (const cover of document.querySelectorAll<HTMLElement>("[data-navigator-cover]")) {
		if (cover.dataset.navigatorCover !== frame) continue;
		const box = cover.getBoundingClientRect();
		if (box.bottom > 0 && box.top < window.innerHeight && box.width > 0) {
			return { x: box.left, y: box.top, w: box.width, h: box.height };
		}
	}
	return null;
}

/** The levels above the open one, each a step back up to it: the project, then each page holding it. */
function Crumbs({ project, level, onLevel }: { project: string; level: string; onLevel: (page: string) => void }) {
	const chain = level === ROOT_PAGE ? [] : pageChain(level);
	return (
		<nav aria-label="Where" className="flex min-w-0 flex-wrap items-center gap-x-1 px-4 pt-4 pb-1 type-detail">
			<button
				type="button"
				className={cn("cursor-pointer", chain.length === 0 ? "text-text" : "text-muted")}
				onClick={() => onLevel(ROOT_PAGE)}
			>
				{project}
			</button>
			{chain.map((page, index) => (
				<span key={page} className="flex items-center gap-x-1">
					<span className="text-border-raised">/</span>
					<button
						type="button"
						aria-current={index === chain.length - 1 ? "page" : undefined}
						className={cn("cursor-pointer", index === chain.length - 1 ? "text-text" : "text-muted")}
						onClick={() => onLevel(page)}
					>
						{pageName(page)}
					</button>
				</span>
			))}
		</nav>
	);
}

/** A page's own frames as their covers, three phone frames or two desktop ones to a line, each played from there. */
function Covers({
	frames,
	covers,
	marks,
	room,
	onPlay,
}: {
	frames: readonly DesignFrame[];
	covers: Record<string, string>;
	marks: ReadonlyMap<string, Unseen>;
	room: PresenceRoom | undefined;
	onPlay: (frame: string) => void;
}) {
	if (frames.length === 0) return null;
	return (
		<div className="grid grid-cols-6 items-start gap-x-3 gap-y-4 px-4 pt-3">
			{frames.map((frame) => (
				<button
					key={frame.name}
					type="button"
					aria-label={`Play ${pageName(frame.name)}`}
					className={cn(
						"flex min-w-0 cursor-pointer flex-col gap-1.5 text-left active:scale-[0.98]",
						isDesktop(frame) ? "col-span-3" : "col-span-2",
					)}
					onClick={() => onPlay(frame.name)}
				>
					<span
						data-navigator-cover={frame.name}
						className="relative block w-full overflow-hidden rounded-sm border border-border bg-surface"
						style={{ aspectRatio: `${frame.w} / ${Math.min(frame.h, frame.w * 2)}` }}
					>
						{covers[frame.name] !== undefined ? (
							<img
								src={covers[frame.name]}
								alt=""
								draggable={false}
								className="absolute inset-0 h-full w-full object-cover object-top"
							/>
						) : (
							<span className="absolute inset-0 grid place-items-center text-muted type-detail">
								{frame.w} × {frame.h}
							</span>
						)}
						{room !== undefined && (
							<span className="absolute right-1 bottom-1">
								<PartFaces room={room} part={(mate) => mate.state.inside === frame.name} />
							</span>
						)}
					</span>
					<span className="flex min-w-0 items-center gap-1 type-value">
						<span className="truncate">{pageName(frame.name)}</span>
						{marks.has(frame.name) && <UnseenMark mark={marks.get(frame.name) ?? "changed"} />}
					</span>
				</button>
			))}
		</div>
	);
}

/** What find finds: pages by their path and frames by their name, a handful of each. */
function Found({
	query,
	pages,
	frames,
	totals,
	covers,
	onPage,
	onFrame,
}: {
	query: string;
	pages: readonly string[];
	frames: readonly DesignFrame[];
	totals: ReadonlyMap<string, number>;
	covers: Record<string, string>;
	onPage: (page: string) => void;
	onFrame: (frame: string) => void;
}) {
	const pageHits = pages.filter((page) => page.toLowerCase().includes(query)).slice(0, FOUND.pages);
	const frameHits = frames
		.filter((frame) => pageName(frame.name).toLowerCase().includes(query))
		.slice(0, FOUND.frames);
	if (pageHits.length + frameHits.length === 0)
		return <div className="px-4 py-3 text-muted type-detail">nothing matches {query}</div>;
	return (
		<>
			{pageHits.map((page) => (
				<Row
					key={page}
					label={page}
					onClick={() => onPage(page)}
					icon={<FolderIcon className="h-4 w-4 text-muted" />}
				>
					<span className="min-w-0 flex-1 truncate type-value">
						<span className="text-muted">{pageParent(page) === ROOT_PAGE ? "" : `${pageParent(page)}/`}</span>
						{pageName(page)}
					</span>
					<span className="text-muted type-detail">{totals.get(page) ?? 0}</span>
				</Row>
			))}
			{frameHits.map((frame) => (
				<Row
					key={frame.name}
					label={`Play ${pageName(frame.name)}`}
					onClick={() => onFrame(frame.name)}
					icon={<Thumb frame={frame} cover={covers[frame.name]} />}
				>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate type-value">{pageName(frame.name)}</span>
						<span className="truncate text-muted type-detail">{pageParent(frame.name) || "top level"}</span>
					</span>
				</Row>
			))}
		</>
	);
}

function Section({ children }: { children: ReactNode }) {
	return <div className="px-4 pt-3 pb-1 text-muted type-detail">{children}</div>;
}

function Row({
	children,
	icon,
	label,
	onClick,
}: {
	children: ReactNode;
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 py-1.5 pr-4 pl-4 text-left active:bg-surface"
		>
			<span className="flex w-9 shrink-0 justify-center">{icon}</span>
			{children}
		</button>
	);
}

/** A frame's cover, small, at its own shape: wide for a desktop frame, tall for a phone one. */
function Thumb({ frame, cover }: { frame: DesignFrame | undefined; cover: string | undefined }) {
	if (frame === undefined) return <FrameIcon className="h-4 w-4 text-muted" />;
	const wide = frame.w > frame.h;
	const w = wide ? 36 : 20;
	const h = Math.min(36, (w * frame.h) / frame.w);
	return (
		<span
			data-navigator-cover={frame.name}
			className="block overflow-hidden rounded-[3px] bg-surface"
			style={{ width: w, height: h }}
		>
			{cover !== undefined && (
				<img src={cover} alt="" draggable={false} className="h-full w-full object-cover object-top" />
			)}
		</span>
	);
}
