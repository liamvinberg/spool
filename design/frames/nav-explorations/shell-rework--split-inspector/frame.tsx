import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import {
	byName,
	CanvasScene,
	connectionsOf,
	ConnectionsList,
	framesByPage,
	type FrameNode,
	PageTree,
	type PageName,
} from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Shell rework — my split. The left tree is the page switcher and nothing more:
 * pages are folders, frames live inside, no links, no second duty. The right
 * rail is the selection inspector — identity plus the unified connections list
 * as its dominant section, a page dashboard when nothing is selected. Where
 * things live on the left, what a thing is and does on the right.
 */

const DIMS = "390 × 844";

export default function ShellReworkSplitInspector() {
	const [activePage, setActivePage] = useState<PageName>("session");
	const [selected, setSelected] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<PageName, boolean>>({
		session: true,
		dialogs: false,
		tools: false,
		gates: false,
	});

	const switchPage = (page: PageName) => {
		setActivePage(page);
		setSelected(null);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const selectFrame = (name: string) => {
		const page = byName(name).page;
		setActivePage(page);
		setSelected(name);
		setExpanded((cur) => ({ ...cur, [page]: true }));
	};

	const jump = (target: FrameNode) => selectFrame(target.name);

	const pageFrames = framesByPage(activePage);
	const links = selected ? connectionsOf(selected) : [];

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%">
			<div className="flex h-full min-h-0">
				<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-3.5">
						<span className="font-semibold text-base leading-base">Pages</span>
						<span className="font-mono text-muted text-xs leading-xs">{4}</span>
					</div>
					<PageTree
						activePage={activePage}
						expanded={expanded}
						selected={selected}
						onTogglePage={(page) => setExpanded((cur) => ({ ...cur, [page]: !cur[page] }))}
						onSwitchPage={switchPage}
						onSelectFrame={selectFrame}
					/>
					<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						folder switches page
					</div>
				</aside>

				<div
					className="relative min-w-0 flex-1 overflow-hidden bg-canvas"
					onClick={() => setSelected(null)}
				>
					<CanvasScene page={activePage} selected={selected} onSelectFrame={selectFrame} />
					<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
						page · {activePage}
					</div>
				</div>

				<aside className="flex w-[320px] shrink-0 flex-col border-border border-l bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-4">
						<span className="font-medium text-base text-text leading-none">Selection</span>
						<span className="font-mono text-2xs text-muted leading-3">{selected ? "frame" : "page"}</span>
					</div>

					{selected ? (
						<>
							<div className="shrink-0 border-border border-b px-4 py-3.5">
								<div className="flex items-center justify-between">
									<div className="flex min-w-0 items-baseline gap-2">
										<span className="font-mono text-thread text-xs leading-3">▸</span>
										<span className="truncate font-mono text-text text-xs leading-3">{selected}</span>
									</div>
									<span className="shrink-0 font-mono text-2xs text-muted leading-3">{DIMS}</span>
								</div>
								<div className="mt-2 flex items-center gap-2">
									<span className="rounded-xs border border-border bg-surface px-1.5 py-[2px] font-mono text-2xs text-muted leading-3">
										{byName(selected).page}
									</span>
									<span className="min-w-0 truncate font-mono text-2xs text-muted/70 leading-3">
										frames/{selected}/frame.tsx
									</span>
								</div>
								<div className="mt-3 flex items-center gap-1.5">
									<RailAction icon={<ReloadIcon />} label="Reload" />
									<RailAction icon={<EditorIcon />} label="Open in editor" />
								</div>
							</div>

							<div className="flex items-center justify-between px-4 pt-3.5 pb-1">
								<span className="font-mono text-2xs text-muted leading-3">connections</span>
								<span className="font-mono text-2xs text-muted/60 leading-3">{links.length} outbound</span>
							</div>
							{links.length > 0 ? (
								<ConnectionsList source={selected} onJump={jump} />
							) : (
								<div className="px-4 pt-4 font-mono text-2xs text-muted/60 leading-4">
									no outbound links from this frame
								</div>
							)}
						</>
					) : (
						<PageDashboard page={activePage} frames={pageFrames} onSelect={selectFrame} />
					)}
				</aside>
			</div>
		</SpoolShell>
	);
}

function PageDashboard({
	page,
	frames,
	onSelect,
}: {
	page: PageName;
	frames: FrameNode[];
	onSelect: (name: string) => void;
}) {
	const totalLinks = frames.reduce((sum, f) => sum + connectionsOf(f.name).length, 0);
	const busiest = [...frames].sort((a, b) => connectionsOf(b.name).length - connectionsOf(a.name).length).slice(0, 3);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="border-border border-b px-4 py-3.5">
				<div className="flex items-center justify-between">
					<div className="flex items-baseline gap-2">
						<span className="font-mono text-muted text-xs leading-3">▸</span>
						<span className="font-mono text-text text-xs leading-3">{page}</span>
					</div>
					<span className="font-mono text-2xs text-muted leading-3">active page</span>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2">
					<Stat value={String(frames.length)} label="frames" />
					<Stat value={String(totalLinks)} label="links out" />
				</div>
			</div>
			<div className="px-4 pt-3.5">
				<span className="font-mono text-2xs text-muted leading-3">frames on this page</span>
			</div>
			<div className="px-3 pt-1.5">
				{busiest.map((f) => (
					<button
						key={f.name}
						type="button"
						onClick={() => onSelect(f.name)}
						className="group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-surface"
					>
						<span className="font-mono text-2xs text-muted/70 leading-3">▸</span>
						<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
							{f.name}
						</span>
						<span className="font-mono text-2xs text-muted/50 leading-3">{connectionsOf(f.name).length}</span>
					</button>
				))}
			</div>
			<div className="mt-auto px-4 py-3.5">
				<span className="font-mono text-2xs text-muted/60 leading-4">select a frame to inspect it and jump to where it links</span>
			</div>
		</div>
	);
}

function RailAction({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<button
			type="button"
			className="flex items-center gap-1.5 rounded-sm border border-border-raised bg-surface px-2 py-1 font-mono text-2xs text-muted leading-3 hover:border-thread hover:text-text"
		>
			<span className="text-muted">{icon}</span>
			<span>{label}</span>
		</button>
	);
}

function Stat({ value, label }: { value: string; label: string }) {
	return (
		<div className="rounded-sm border border-border bg-surface px-2.5 py-2">
			<div className="font-mono text-md text-text leading-none">{value}</div>
			<div className="mt-1 font-mono text-2xs text-muted leading-3">{label}</div>
		</div>
	);
}

function ReloadIcon() {
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path d="M10 5.2A4 4 0 1 0 10.2 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
			<path d="M10.3 2.2v2.7H7.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function EditorIcon() {
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path d="M4 2.5 1.5 6 4 9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M8 2.5 10.5 6 8 9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
