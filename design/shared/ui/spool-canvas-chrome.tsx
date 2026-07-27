import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { ChevronIcon, FolderIcon, HandIcon, PanelCaret, SelectIcon } from "./spool-icons";

/**
 * The canvas chrome: the Pages rail on the left, the viewport between, the
 * Inspector rail on the right, and the tool bar floating over the bottom of
 * the viewport. Both rails collapse to a 44px strip; the widths here are the
 * shipped ones (248 pages, 300 inspector).
 *
 * The viewport is a slot — whatever frames the specimen wants to show go in as
 * children, positioned against it.
 */

const PAGES_W = 248;
const INSPECTOR_W = 300;

export interface PageRow {
	name: string;
	frames: readonly string[];
	/** the page whose canvas is on screen — one thread-coloured spine */
	active?: boolean;
	open?: boolean;
}

export function CanvasChrome({
	pages,
	selected,
	inspector = "elements",
	tool = "select",
	rail,
	railWidth = INSPECTOR_W,
	railLabel = "Inspector",
	children,
}: {
	pages: readonly PageRow[];
	/** the selected frame, as both rails show it; nothing selected is a real state */
	selected?: string | undefined;
	inspector?: "elements" | "connections" | undefined;
	tool?: "select" | "hand" | undefined;
	/** an exploration's own right rail, taking the inspector's place — proposals only */
	rail?: ReactNode | undefined;
	/** the right rail's width; the shipped inspector is 300 */
	railWidth?: number | undefined;
	/** what the rail slot announces itself as; a proposal rail is not the inspector */
	railLabel?: string | undefined;
	children?: ReactNode;
}) {
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg">
			<PagesRail pages={pages} selected={selected} />
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				{children}
				<CanvasTools tool={tool} />
			</div>
			{rail === undefined ? (
				<InspectorRail mode={inspector} selected={selected} />
			) : (
				<aside
					aria-label={railLabel}
					className="flex shrink-0 flex-col border-border border-l bg-bg"
					style={{ width: railWidth }}
				>
					{rail}
				</aside>
			)}
		</div>
	);
}

function PagesRail({ pages, selected }: { pages: readonly PageRow[]; selected?: string | undefined }) {
	return (
		<aside className="flex shrink-0 flex-col border-border border-r bg-bg" style={{ width: PAGES_W }}>
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
				<div className="flex items-baseline gap-2">
					<h1 className="font-semibold text-base leading-base">Pages</h1>
					<span className="font-mono text-muted text-xs leading-xs">{pages.length}</span>
				</div>
				<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
					<PanelCaret dir="left" className="h-3.5 w-2.5" />
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{pages.map((page) => (
					<div key={page.name}>
						<div className={cn("group relative flex h-8 items-center pr-1.5", page.active === true && "bg-surface")}>
							{page.active === true ? (
								<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
								<ChevronIcon open={page.open === true} className="h-2.5 w-2.5" />
							</span>
							<span className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left">
								<FolderIcon
									className={cn("h-3.5 w-3.5 shrink-0", page.active === true ? "text-thread" : "text-muted")}
								/>
								<span
									className={cn(
										"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
										page.active === true ? "text-text" : "text-muted",
									)}
								>
									{page.name}
								</span>
							</span>
							<span className="font-mono text-2xs text-muted/60 leading-3">{page.frames.length}</span>
						</div>
						{page.open === true ? (
							<div className="relative pb-0.5">
								<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
								{page.frames.map((frame) => (
									<div
										key={frame}
										className={cn("relative flex h-7 items-center", frame === selected && "bg-surface")}
									>
										<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
										<span
											className={cn(
												"truncate pl-[34px] font-mono text-sm leading-sm",
												frame === selected ? "text-text" : "text-muted",
											)}
										>
											{frame}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				))}
			</div>
		</aside>
	);
}

const TOOLS = [
	{ id: "select", label: "select", key: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", key: "H", Icon: HandIcon },
] as const;

function CanvasTools({ tool }: { tool: "select" | "hand" }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div
				role="toolbar"
				aria-label="canvas tools"
				className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur"
			>
				{TOOLS.map((meta) => (
					<span
						key={meta.id}
						aria-label={meta.label}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-md",
							tool === meta.id ? "bg-raised text-text" : "text-muted",
						)}
					>
						<meta.Icon className="h-[18px] w-[18px]" />
					</span>
				))}
			</div>
		</div>
	);
}

/**
 * The right rail's tab strip. Two tabs as it shipped; a proposal that adds a
 * tab passes its own list, and the strip stays the same strip.
 */
export function RailTabs({ tabs, active }: { tabs: readonly string[]; active: string }) {
	return (
		<div className="flex h-11 shrink-0 items-stretch justify-between border-border border-b pr-2 pl-4">
			<div className="flex h-full items-stretch gap-5">
				{tabs.map((candidate) => (
					<span
						key={candidate}
						className={cn(
							"relative flex h-full items-center font-mono text-xs leading-xs",
							active === candidate ? "text-text" : "text-muted/60",
						)}
					>
						{candidate}
						{active === candidate ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
					</span>
				))}
			</div>
			<span className="flex h-11 w-7 shrink-0 items-center justify-center text-muted/60">
				<PanelCaret dir="right" className="h-3.5 w-2.5" />
			</span>
		</div>
	);
}

function InspectorRail({ mode, selected }: { mode: "elements" | "connections"; selected?: string | undefined }) {
	return (
		<aside
			aria-label="Inspector"
			className="flex shrink-0 flex-col border-border border-l bg-bg"
			style={{ width: INSPECTOR_W }}
		>
			<RailTabs tabs={["elements", "connections"]} active={mode} />
			{selected === undefined ? (
				<p className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">select a frame to inspect it</p>
			) : mode === "elements" ? (
				<ElementsTab frame={selected} />
			) : (
				<ConnectionsTab frame={selected} />
			)}
		</aside>
	);
}

function Identity({ frame }: { frame: string }) {
	return (
		<div className="flex flex-col gap-1 border-border border-b px-4 py-3">
			<span className="truncate font-mono text-sm text-text leading-sm">{frame}</span>
			<span className="truncate font-mono text-2xs text-muted/60 leading-3">frames/app/{frame}/frame.tsx</span>
		</div>
	);
}

const ELEMENTS: readonly { name: string; depth: number }[] = [
	{ name: "screen", depth: 0 },
	{ name: "header", depth: 1 },
	{ name: "menu-list", depth: 1 },
	{ name: "menu-item", depth: 2 },
	{ name: "checkout-bar", depth: 1 },
];

function ElementsTab({ frame }: { frame: string }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Identity frame={frame} />
			<div className="flex items-center justify-between px-4 pt-1 pb-1">
				<span className="font-mono text-2xs text-muted leading-3">elements</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{ELEMENTS.length}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden pb-3">
				{ELEMENTS.map((row) => (
					<div key={row.name} className="flex h-7 items-center">
						<span
							className="truncate font-mono text-sm text-muted leading-sm"
							style={{ paddingLeft: 16 + row.depth * 14 }}
						>
							{row.name}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

const CONNECTIONS: readonly { target: string; via: string }[] = [
	{ target: "cart", via: "till kassan" },
	{ target: "receipt", via: "betala" },
];

function ConnectionsTab({ frame }: { frame: string }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Identity frame={frame} />
			<div className="flex items-center justify-between px-4 pt-1 pb-1">
				<span className="font-mono text-2xs text-muted leading-3">connections</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{CONNECTIONS.length}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden pb-3">
				{CONNECTIONS.map((row) => (
					<div key={row.target} className="flex h-7 items-center gap-2 px-4">
						<span className="h-[2px] w-2 shrink-0 bg-thread" />
						<span className="truncate font-mono text-sm text-text leading-sm">{row.target}</span>
						<span className="ml-auto truncate font-mono text-2xs text-muted/60 leading-3">{row.via}</span>
					</div>
				))}
			</div>
		</div>
	);
}
