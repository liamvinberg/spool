import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import {
	byName,
	connectionsOf,
	ConnectionsList,
	FRAME_H,
	FRAME_W,
	type FrameNode,
	FrameBox,
	FrameLabel,
	ON_CANVAS,
	SelectionCorners,
} from "../../../shared/ui/portal-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * Inspector rail — the B direction grown into a general selection sidebar,
 * honest to spool: a frame's properties live in agent-authored code, so there
 * are no style or layout knobs. The rail carries a thin identity strip (name,
 * page, size, source, the real actions) and hands the rest of its height to the
 * connections list. Nothing selected, it becomes a quiet page summary so the
 * persistent rail always earns its width.
 */

const DIMS = "390 × 844";

export default function PortalNavInspector() {
	const [selected, setSelected] = useState<string | null>(null);
	const [jumped, setJumped] = useState<FrameNode | null>(null);

	const select = (name: string) => {
		setSelected(name);
		setJumped(null);
	};

	const jump = (target: FrameNode) => {
		if (target.pos) select(target.name);
		else {
			setJumped(target);
			setSelected(null);
		}
	};

	const links = selected ? connectionsOf(selected) : [];
	const busiest = [...ON_CANVAS].sort((a, b) => connectionsOf(b.name).length - connectionsOf(a.name).length).slice(0, 3);
	const totalLinks = ON_CANVAS.reduce((sum, f) => sum + connectionsOf(f.name).length, 0);

	return (
		<SpoolShell activeTab="opencode" tabs={["opencode", "kaffe"]} zoom="100%">
			<div className="flex h-full w-full">
				<div
					className="relative min-w-0 flex-1 overflow-hidden bg-canvas"
					onClick={() => {
						setSelected(null);
						setJumped(null);
					}}
				>
					{ON_CANVAS.map((frame) => {
						const isSelected = frame.name === selected;
						return (
							<div
								key={frame.name}
								className="absolute flex flex-col gap-1.5"
								style={{ left: frame.pos!.x, top: frame.pos!.y, width: FRAME_W }}
							>
								<FrameLabel name={frame.name} selected={isSelected} />
								<div className="relative">
									<FrameBox
										selected={isSelected}
										onSelect={() => select(frame.name)}
										style={{ width: FRAME_W, height: FRAME_H }}
									/>
									{isSelected ? <SelectionCorners /> : null}
								</div>
							</div>
						);
					})}
					<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/60 leading-3">
						page · session
					</div>
				</div>

				<aside className="flex w-[320px] shrink-0 flex-col border-border border-l bg-bg">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-4">
						<span className="font-medium text-base text-text leading-none">Selection</span>
						{selected ? (
							<span className="font-mono text-2xs text-muted leading-3">frame</span>
						) : (
							<span className="font-mono text-2xs text-muted leading-3">page</span>
						)}
					</div>

					{selected ? (
						<>
							{/* Identity strip: what a selected spool frame actually has. */}
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

							{/* Connections: the dominant section. */}
							<div className="flex items-center justify-between px-4 pt-3.5 pb-1">
								<span className="font-mono text-2xs text-muted leading-3">connections</span>
								<span className="font-mono text-2xs text-muted/60 leading-3">{links.length} outbound</span>
							</div>
							<ConnectionsList source={selected} onJump={jump} />
						</>
					) : (
						<div className="flex min-h-0 flex-1 flex-col">
							<div className="border-border border-b px-4 py-3.5">
								<div className="flex items-center justify-between">
									<div className="flex items-baseline gap-2">
										<span className="font-mono text-muted text-xs leading-3">▸</span>
										<span className="font-mono text-text text-xs leading-3">session</span>
									</div>
									<span className="font-mono text-2xs text-muted leading-3">this page</span>
								</div>
								<div className="mt-3 grid grid-cols-2 gap-2">
									<Stat value={String(ON_CANVAS.length)} label="frames" />
									<Stat value={String(totalLinks)} label="links out" />
								</div>
							</div>
							<div className="px-4 pt-3.5">
								<span className="font-mono text-2xs text-muted leading-3">busiest frames</span>
							</div>
							<div className="px-3 pt-1.5">
								{busiest.map((f) => (
									<button
										key={f.name}
										type="button"
										onClick={() => select(f.name)}
										className="group flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-surface"
									>
										<span className="font-mono text-2xs text-muted/70 leading-3">▸</span>
										<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
											{f.name}
										</span>
										<span className="font-mono text-2xs text-muted/50 leading-3">
											{connectionsOf(f.name).length}
										</span>
									</button>
								))}
							</div>
							<div className="mt-auto px-4 py-3.5">
								<span className="font-mono text-2xs text-muted/60 leading-4">
									select a frame to inspect it and jump to where it links
								</span>
							</div>
						</div>
					)}

					{jumped ? (
						<div className="shrink-0 border-border border-t px-4 py-2.5">
							<span className="font-mono text-2xs text-muted leading-3">selected </span>
							<span className="font-mono text-text text-2xs leading-3">{jumped.name}</span>
							<span className="font-mono text-2xs text-muted leading-3"> on {jumped.page}</span>
						</div>
					) : null}
				</aside>
			</div>
		</SpoolShell>
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
			<path
				d="M10 5.2A4 4 0 1 0 10.2 7"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
			/>
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
