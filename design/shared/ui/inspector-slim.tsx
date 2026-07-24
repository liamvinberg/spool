import { useState } from "react";
import { cn } from "../lib/utils";
import { byName, connectionsOf, CURRENT_PAGE, type FrameNode, PAGE_ORDER, pageLabel } from "./portal-nav";

/**
 * The lean selection inspector shared by the shell-rework inspector-slim and
 * inspector-overlay variants. It is the split-inspector rail with the dashboard,
 * stat tiles and busiest-frames list removed: identity is one line, actions are
 * quiet inline glyphs, and the connections are just the list.
 *
 * Certainty (will / might) and verified are the only per-row ornament, and they
 * carry meaning, not decoration: a solid arrow is a link that will fire, a dashed
 * arrow one that might, a trailing check a link a real session has already walked.
 * The base substrate has no such field, so it is derived here — deterministic per
 * source→target pair, stable across renders — without touching the shared data.
 */

const DIMS = "390 × 844";

export interface LinkCertainty {
	certainty: "will" | "might";
	verified: boolean;
}

/** Stable, derived certainty for a source→target link. No randomness, no state. */
export function linkCertainty(source: string, target: string): LinkCertainty {
	let h = 0;
	const key = `${source}→${target}`;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
	return { certainty: h % 3 === 0 ? "might" : "will", verified: h % 4 === 0 };
}

/** Honest-empty idle: one quiet line, nothing else. */
export function SlimIdle({ line = "select a frame to inspect it" }: { line?: string }) {
	return (
		<div className="flex flex-1 items-center justify-center px-8 text-center">
			<span className="font-mono text-2xs text-muted/55 leading-4">{line}</span>
		</div>
	);
}

/** Identity plus the unified connections list — the body of the slim rail. */
export function SlimInspector({ selected, onJump }: { selected: string; onJump: (target: FrameNode) => void }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<SlimIdentity name={selected} />
			<SlimConnections source={selected} onJump={onJump} />
		</div>
	);
}

/** One-line identity: name + page + size, source path muted, quiet glyph actions. */
export function SlimIdentity({ name }: { name: string }) {
	const frame = byName(name);
	return (
		<div className="shrink-0 px-4 pt-3.5 pb-3">
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-thread text-xs leading-3">▸</span>
				<span className="min-w-0 flex-1 truncate font-mono text-text text-xs leading-3">{name}</span>
				<span className="shrink-0 font-mono text-2xs text-muted leading-3">{frame.page}</span>
				<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">{DIMS}</span>
			</div>
			<div className="mt-2 flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/55 leading-3">
					frames/{name}/frame.tsx
				</span>
				<div className="flex shrink-0 items-center gap-0.5">
					<GlyphButton title="Reload frame">
						<ReloadIcon />
					</GlyphButton>
					<GlyphButton title="Open in editor">
						<EditorIcon />
					</GlyphButton>
				</div>
			</div>
		</div>
	);
}

/** One outbound link with its resolved certainty and verified state. */
export interface ConnEdge {
	target: FrameNode;
	certainty: "will" | "might";
	verified: boolean;
}

/**
 * The connections header, filter and grouped list — the dominant rail section.
 * Pass `edges` to drive the list from a caller's own graph (so a frame can keep
 * its canvas lines and this list in sync); omit it and the shared graph is used.
 */
export function SlimConnections({
	source,
	onJump,
	edges,
}: {
	source: string;
	onJump: (target: FrameNode) => void;
	edges?: ConnEdge[];
}) {
	const [query, setQuery] = useState("");
	const rows: ConnEdge[] = edges ?? connectionsOf(source).map((t) => ({ target: t, ...linkCertainty(source, t.name) }));
	const q = query.trim().toLowerCase();
	const filtered = q ? rows.filter((r) => r.target.name.includes(q) || r.target.page.includes(q)) : rows;
	const groups = PAGE_ORDER.map((page) => ({ page, items: filtered.filter((r) => r.target.page === page) })).filter(
		(g) => g.items.length > 0,
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center justify-between px-4 pt-1 pb-1.5">
				<span className="font-mono text-2xs text-muted leading-3">connections</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{rows.length}</span>
			</div>

			{rows.length === 0 ? (
				<div className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">no outbound links from this frame</div>
			) : (
				<>
					<div className="px-3 pb-2">
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="filter links"
							className="w-full rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-2xs text-text leading-3 placeholder:text-muted/60 focus:border-border-raised focus:outline-none"
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
						{groups.map((group) => (
							<div key={group.page} className="pt-1.5">
								<div className="flex items-center justify-between px-2 pb-1">
									<span
										className={cn(
											"font-mono text-2xs leading-3",
											group.page === CURRENT_PAGE ? "text-muted/80" : "text-muted/55",
										)}
									>
										{pageLabel(group.page)}
									</span>
									<span className="font-mono text-2xs text-muted/35 leading-3">{group.items.length}</span>
								</div>
								<div>
									{group.items.map((edge) => (
										<ConnectionRow key={edge.target.name} edge={edge} onJump={onJump} />
									))}
								</div>
							</div>
						))}
						{groups.length === 0 ? (
							<div className="px-2 pt-6 text-center font-mono text-2xs text-muted/55 leading-3">no links match</div>
						) : null}
					</div>
				</>
			)}
		</div>
	);
}

/** One plain link row: certainty as the leading glyph, verified as a trailing check. */
function ConnectionRow({ edge, onJump }: { edge: ConnEdge; onJump: (t: FrameNode) => void }) {
	const { target, certainty, verified } = edge;
	return (
		<button
			type="button"
			onClick={() => onJump(target)}
			className="group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-surface"
		>
			<span
				title={certainty === "will" ? "will navigate" : "might navigate"}
				className={cn("shrink-0 text-xs leading-3", certainty === "will" ? "text-thread/70" : "text-muted/45")}
			>
				{certainty === "will" ? "→" : "⇢"}
			</span>
			<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted leading-3 group-hover:text-text">
				{target.name}
			</span>
			{verified ? (
				<span title="verified in a session" className="shrink-0 text-2xs text-muted/50 leading-3">
					✓
				</span>
			) : null}
		</button>
	);
}

function GlyphButton({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			className="flex h-5 w-5 items-center justify-center rounded-sm text-muted/70 hover:text-text"
		>
			{children}
		</button>
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
