import { Fragment, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { Place, PlaceTab, PlaceTeam } from "shared/lib/explore/tab-place/tabs";
import { cn } from "shared/lib/utils";
import { ThreadIcon } from "shared/ui/spool/icons";
import { Faces, type Mate } from "shared/ui/spool/presence";

/**
 * The Mac window cropped to its top: the shipped header (`src/ui/app.tsx` with `src/ui/tab-strip.tsx`, every
 * class copied) over a strip of canvas, with one change per take to how a tab says where its project lives.
 *
 * - `mark`: a team project's tab leads with its team's letter mark, the one Home's switcher draws. Your own
 *   projects are untouched. A pause hollows the mark.
 * - `crumb`: a team project's tab is named by its address, `tidemark/checkout`, the path its spool.page link
 *   ends in. A pause breaks the slash; an ended copy keeps the team struck through.
 * - `group`: a team's open copies sit together behind its chip, and the chip folds them away when the strip
 *   runs out of room. Your own projects stand outside every group.
 *
 * Held still: no drag, and the hover, the card and the menu are props.
 */

export type TabPlaceTake = "mark" | "crumb" | "group";

/** Home's team letter-mark hues (`src/ui/teams.tsx`), picked by the same sum. */
const HUES = ["#2E5D70", "#6B4E2E", "#4E3F70", "#2F6150", "#70393F"];
const hueOf = (team: PlaceTeam) => HUES[[...team.address].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % HUES.length];

const MATES: readonly Mate[] = [
	{ name: "sam", color: "#7cc4a4" },
	{ name: "mira", color: "#e2b36b" },
];

export function TabPlaceWindow({
	take,
	tabs,
	focused,
	hovered,
	card = false,
	menu,
	folded = [],
	frame,
	argues,
}: {
	take: TabPlaceTake;
	tabs: readonly PlaceTab[];
	focused: string;
	/** the tab under the pointer */
	hovered?: string | undefined;
	/** the hovered tab's card is open */
	card?: boolean | undefined;
	/** the tab whose menu is open */
	menu?: string | undefined;
	/** group take: the teams whose tabs are folded into their chip */
	folded?: readonly string[] | undefined;
	frame: string;
	argues: string;
}) {
	const win = useRef<HTMLDivElement>(null);
	const strip = useRef<HTMLDivElement>(null);
	const [anchors, setAnchors] = useState<Record<string, { left: number; bottom: number }>>({});
	const focusedTab = tabs.find((tab) => tab.root === focused);

	useLayoutEffect(() => {
		const box = win.current?.getBoundingClientRect();
		const row = strip.current;
		if (box === undefined || row === null) return;
		// the shipped strip scrolls its focused tab into view; this one does it once
		const active = row.querySelector<HTMLElement>(`[data-tab="${focused}"]`);
		if (active !== null) {
			const over = active.getBoundingClientRect().right - row.getBoundingClientRect().right;
			if (over > 0) row.scrollLeft += over + 2;
		}
		const next: Record<string, { left: number; bottom: number }> = {};
		for (const element of row.querySelectorAll<HTMLElement>("[data-tab]")) {
			const at = element.getBoundingClientRect();
			next[element.dataset.tab ?? ""] = { left: at.left - box.left, bottom: at.bottom - box.top };
		}
		setAnchors(next);
	}, [focused]);

	const cardTab = card ? tabs.find((tab) => tab.root === hovered) : undefined;
	const menuTab = tabs.find((tab) => tab.root === menu);

	return (
		<div className="flex h-full flex-col gap-3 bg-bg p-4 pb-3 font-sans text-text antialiased [font-synthesis:none]">
			<div ref={win} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border-raised">
				<div className="pointer-events-none absolute top-[16px] left-[14px] z-30 flex gap-[8px]" aria-hidden="true">
					<i className="h-[12px] w-[12px] rounded-full bg-[#ff5f57]" />
					<i className="h-[12px] w-[12px] rounded-full bg-[#febc2e]" />
					<i className="h-[12px] w-[12px] rounded-full bg-[#28c840]" />
				</div>
				<div className="flex h-full flex-col">
					<header className="app-header relative z-20 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4 pl-[96px] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']">
						<div className="flex h-full min-w-0 flex-1 items-center">
							<div className="app-home-zone relative mr-[12px] flex h-full shrink-0 items-center pr-[16px] after:absolute after:right-0 after:h-[18px] after:w-px after:bg-border-raised after:content-['']">
								<span className="app-home flex h-[32px] items-center gap-[9px] [padding:0_4px_0_6px] [font:var(--type-control)] [color:var(--color-muted)]">
									<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
										<path d="m3.5 8 6.5-5.5L16.5 8v9h-5v-5h-3v5h-5Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
									</svg>
									<span>Home</span>
								</span>
							</div>
							<nav aria-label="Open projects" className="project-tabs flex h-full min-w-0 items-center">
								<div
									ref={strip}
									className="project-tabs-scroll relative z-[1] flex h-full min-w-0 items-center gap-[2px] overflow-x-auto overflow-y-hidden px-[2px] py-0 [scrollbar-width:none]"
								>
									{take === "group" ? (
										<Grouped tabs={tabs} focused={focused} hovered={hovered} folded={folded} />
									) : (
										tabs.map((tab) => (
											<Tab key={tab.root} tab={tab} take={take} active={tab.root === focused} hovered={tab.root === hovered} />
										))
									)}
								</div>
								<span className="project-tabs-plus relative ml-[6px] flex h-[30px] w-[32px] shrink-0 items-center justify-center rounded-[6px] [color:var(--color-muted)]">
									<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
										<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
									</svg>
								</span>
							</nav>
						</div>
						<div className="flex h-full shrink-0 items-center gap-4">
							<span className="flex h-7 w-7 items-center justify-center rounded-sm text-text">
								<ThreadIcon className="h-3.5 w-3.5" />
							</span>
							<span className="min-w-9 text-right text-muted type-detail">72%</span>
							{focusedTab?.place.kind === "team" && focusedTab.place.here !== undefined ? <Faces mates={MATES} /> : null}
						</div>
					</header>
					<Field />
				</div>
				{cardTab !== undefined && anchors[cardTab.root] !== undefined ? (
					<div className="absolute z-40" style={{ left: anchors[cardTab.root]?.left, top: (anchors[cardTab.root]?.bottom ?? 0) + 8 }}>
						<PlaceCard tab={cardTab} marked={take !== "crumb"} />
					</div>
				) : null}
				{menuTab !== undefined && anchors[menuTab.root] !== undefined ? (
					<div className="absolute z-40" style={{ left: (anchors[menuTab.root]?.left ?? 0) + 14, top: (anchors[menuTab.root]?.bottom ?? 0) - 6 }}>
						<PlaceMenu tab={menuTab} marked={take !== "crumb"} />
					</div>
				) : null}
			</div>
			<div className="flex shrink-0 items-baseline gap-3 px-1">
				<span className="shrink-0 font-mono text-2xs text-muted/60">{frame}</span>
				<p className="min-w-0 text-base text-muted leading-base">{argues}</p>
			</div>
		</div>
	);
}

/** The tab, as the shipped strip draws it; only what the label holds changes per take. */
function Tab({
	tab,
	take,
	active,
	hovered,
}: {
	tab: PlaceTab;
	take: TabPlaceTake;
	active: boolean;
	hovered: boolean;
}) {
	return (
		<div className="project-tab-slot relative h-[36px] w-max min-w-[112px] max-w-[228px] shrink-0">
			<div
				data-tab={tab.root}
				className={cn(
					"project-tab relative flex h-full w-full select-none items-center [border-radius:8px_8px_0_0]",
					hovered && !active && "[background:#ffffff04]",
				)}
			>
				{active && (
					<div className="project-tab-selection pointer-events-none absolute [inset:0_0_-4px] border-border border-solid bg-canvas [border-radius:8px_8px_0_0] [border-width:1px_1px_0]" />
				)}
				<span
					className={cn(
						"project-tab-label relative flex h-full min-w-0 flex-auto items-center [font:var(--type-control)] [padding:0_38px_0_12px]",
						active ? "text-text" : "[color:var(--color-muted)]",
						take === "mark" && tab.place.kind === "team" && "gap-[7px] pl-[10px]",
					)}
				>
					<Label tab={tab} take={take} active={active} />
				</span>
				<span
					className={cn(
						"project-tab-close absolute right-[4px] flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[5px] [color:var(--color-muted)]",
						active || hovered ? "opacity-100" : "opacity-0",
					)}
				>
					<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path d="m3 3 6 6m0-6L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
					</svg>
				</span>
			</div>
		</div>
	);
}

function Label({ tab, take, active }: { tab: PlaceTab; take: TabPlaceTake; active: boolean }) {
	const { place } = tab;
	const name = <span className="min-w-0 truncate">{tab.name}</span>;
	if (take === "mark") {
		return (
			<>
				{place.kind === "team" ? <PlaceMark team={place.team} paused={place.paused !== undefined} /> : null}
				{name}
			</>
		);
	}
	if (take === "crumb") {
		if (place.kind === "solo") return name;
		const ended = place.kind === "ended";
		const paused = place.kind === "team" && place.paused !== undefined;
		return (
			<span className="flex min-w-0 items-baseline">
				<span
					className={cn(
						"shrink-0 font-mono text-[12px]",
						ended ? "text-muted/45 line-through decoration-muted/60" : active ? "text-muted" : "text-muted/70",
					)}
				>
					{place.team.address}
				</span>
				{paused ? <PauseBars className="mx-[5px] self-center" /> : <span className={cn("shrink-0 font-mono text-[12px]", ended ? "px-[3px] text-muted/45" : "px-[2px] text-muted/50")}>/</span>}
				{name}
			</span>
		);
	}
	// group: the chip names the team, so the tab says only what is wrong with this copy
	return (
		<span className="flex min-w-0 items-baseline gap-[8px]">
			{name}
			{place.kind === "team" && place.paused !== undefined ? <span className="shrink-0 text-muted/80 type-detail">paused</span> : null}
		</span>
	);
}

/** Home's team mark at tab size: filled while the copy syncs, hollow while sync is paused. */
function PlaceMark({ team, paused = false, size = 16 }: { team: PlaceTeam; paused?: boolean; size?: number }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid shrink-0 place-items-center rounded-[4px] font-semibold leading-none",
				paused ? "text-muted" : "text-[#EDEDED]",
			)}
			style={{
				width: size,
				height: size,
				fontSize: 9,
				background: paused ? "transparent" : hueOf(team),
				boxShadow: paused ? "inset 0 0 0 1.25px var(--color-muted)" : undefined,
			}}
		>
			{[...team.name][0]?.toUpperCase()}
		</span>
	);
}

function PauseBars({ className }: { className?: string }) {
	return (
		<svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true" className={cn("shrink-0 text-muted", className)}>
			<rect x="0.5" y="1" width="2.5" height="8" rx="0.75" fill="currentColor" />
			<rect x="5" y="1" width="2.5" height="8" rx="0.75" fill="currentColor" />
		</svg>
	);
}

/** Group take: runs of one team's copies gather behind its chip; everything else is a tab as it ships. */
function Grouped({
	tabs,
	focused,
	hovered,
	folded,
}: {
	tabs: readonly PlaceTab[];
	focused: string;
	hovered: string | undefined;
	folded: readonly string[];
}) {
	const runs: { team: PlaceTeam | null; tabs: PlaceTab[] }[] = [];
	for (const tab of tabs) {
		const team = tab.place.kind === "team" ? tab.place.team : null;
		const last = runs.at(-1);
		if (team !== null && last?.team?.address === team.address) last.tabs.push(tab);
		else runs.push({ team, tabs: [tab] });
	}
	return (
		<>
			{runs.map((run, index) =>
				run.team === null ? (
					<Fragment key={run.tabs[0]?.root}>
						{run.tabs.map((tab) => (
							<Tab key={tab.root} tab={tab} take="group" active={tab.root === focused} hovered={tab.root === hovered} />
						))}
					</Fragment>
				) : (
					<div key={run.team.address} className={cn("flex h-full shrink-0 items-center gap-[2px]", index > 0 && "ml-[8px]", index < runs.length - 1 && "mr-[8px]")}>
						<GroupChip
							team={run.team}
							count={run.tabs.length}
							folded={folded.includes(run.team.address)}
							paused={run.tabs.some((tab) => tab.place.kind === "team" && tab.place.paused !== undefined)}
						/>
						{folded.includes(run.team.address)
							? null
							: run.tabs.map((tab) => (
									<Tab key={tab.root} tab={tab} take="group" active={tab.root === focused} hovered={tab.root === hovered} />
								))}
					</div>
				),
			)}
		</>
	);
}

/** Open, the chip is the team's mark at the head of its run; folded, it names the team and counts what it holds. */
function GroupChip({ team, count, folded, paused }: { team: PlaceTeam; count: number; folded: boolean; paused: boolean }) {
	return (
		<span
			className={cn(
				"relative flex h-[26px] shrink-0 items-center gap-[7px] rounded-[6px] [font:var(--type-control)] text-muted",
				folded ? "bg-surface pr-[9px] pl-[5px]" : "px-[4px] shadow-[inset_0_0_0_1px_var(--color-border-raised)]",
			)}
		>
			<PlaceMark team={team} size={18} />
			{folded ? (
				<>
					<span>{team.name}</span>
					<span className="text-muted/80 tabular-nums type-detail">{count}</span>
					{paused ? <PauseBars /> : null}
				</>
			) : null}
		</span>
	);
}

/** What a tab says when the pointer rests on it: where the project lives, and its sync in the daemon's words. */
function PlaceCard({ tab, marked }: { tab: PlaceTab; marked: boolean }) {
	const { place } = tab;
	return (
		<div className="flex w-[380px] animate-menu-in flex-col gap-[6px] rounded-md border border-border-raised bg-raised px-3 py-[10px]">
			<p className="flex items-center gap-[8px] text-text type-value">
				{marked && place.kind === "team" ? <PlaceMark team={place.team} paused={place.paused !== undefined} /> : null}
				<span className="truncate">{address(tab)}</span>
			</p>
			<p className="text-text type-control">{said(place)}</p>
			<p className="truncate text-muted type-detail">{tab.root}</p>
		</div>
	);
}

const address = (tab: PlaceTab) => (tab.place.kind === "team" ? `spool.page/${tab.place.team.address}/${tab.name.replaceAll(" ", "-")}` : tab.name);

function said(place: Place): string {
	if (place.kind === "solo") return "On this Mac only.";
	if (place.kind === "ended") return `No longer synced with ${place.team.name}. This is now a project on this Mac only.`;
	if (place.paused !== undefined) return `Sync paused: ${place.paused}. Changes stay on this Mac until it lifts.`;
	return `Synced with ${place.team.name}.`;
}

/** The tab's menu (`src/ui/project-tab-menu.tsx`), opening on where the project lives. */
function PlaceMenu({ tab, marked }: { tab: PlaceTab; marked: boolean }) {
	const team = tab.place.kind === "team" ? tab.place.team : null;
	const row = "flex h-[30px] items-center justify-between rounded-sm px-3 text-left text-text hover:bg-surface type-control";
	const rule = <div className="mx-2 my-unit h-px bg-border-raised" />;
	const items: ReactNode = team ? (
		<>
			<span className={cn(row, "bg-surface")}>
				Open on spool.page <span className="text-muted">↗</span>
			</span>
			<span className={row}>Export project…</span>
		</>
	) : (
		<>
			<span className={row}>Move to team…</span>
			<span className={row}>Export project…</span>
		</>
	);
	return (
		<div role="menu" className="flex w-[228px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit">
			<div className="flex flex-col gap-[2px] px-3 pt-[7px] pb-[6px]">
				{marked || team === null ? (
					<span className="flex items-center gap-[7px] text-text type-control">
						{team ? <PlaceMark team={team} paused={tab.place.kind === "team" && tab.place.paused !== undefined} /> : null}
						{team ? team.name : "On this Mac"}
					</span>
				) : (
					<span className="truncate text-text type-value">
						{team.address}/{tab.name.replaceAll(" ", "-")}
					</span>
				)}
				<span className="truncate text-muted type-detail">{tab.root}</span>
			</div>
			{rule}
			{items}
			{rule}
			<span className={row}>Close tab</span>
		</div>
	);
}

/** A strip of the canvas under the header: the pages rail's top and two frames, so the strip has a window to sit on. */
function Field() {
	return (
		<div className="flex min-h-0 flex-1">
			<div className="w-[220px] shrink-0 border-border border-r bg-bg">
				<div className="flex h-[46px] items-center gap-2 border-border border-b px-4">
					<span className="font-medium text-[14px]">Pages</span>
					<span className="text-muted type-detail">3</span>
				</div>
				{["app", "site", "directing"].map((page, index) => (
					<div key={page} className={cn("flex h-[32px] items-center gap-2 px-4 font-mono text-[12px]", index === 0 ? "bg-surface text-text" : "text-muted")}>
						<span className="text-muted">›</span>
						{page}
					</div>
				))}
			</div>
			<div className="relative flex-1 overflow-hidden bg-canvas">
				{[
					{ name: "menu", left: 90 },
					{ name: "cart", left: 360 },
					{ name: "receipt", left: 630 },
				].map((frame) => (
					<div key={frame.name} className="absolute top-[52px] flex flex-col gap-1.5" style={{ left: frame.left }}>
						<span className="font-mono text-[11px] text-muted">{frame.name}</span>
						<div className="h-[300px] w-[220px] rounded-[10px] bg-[#f6f5f3]" />
					</div>
				))}
			</div>
		</div>
	);
}
