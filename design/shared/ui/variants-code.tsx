import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { FolderIcon } from "shared/ui/spool-icons";
import { Argues, FrameIcon } from "shared/ui/variants-shell";

/**
 * A file tree and a code block, for the two lanes whose subject is what an
 * agent writes rather than what a person presses.
 *
 * Both are deliberately plain. The colour is almost gone: keywords step back to
 * muted, names stay at full, and the thread is spent on exactly one thing per
 * frame — the line the take is about. A snippet on this page is meant to be
 * read as code, not looked at as a picture of code.
 */

export type NodeKind = "dir" | "file" | "entry" | "sidecar";

export interface DiskNode {
	readonly id: string;
	readonly name: string;
	readonly depth: number;
	readonly kind: NodeKind;
	/** a short right-hand note: what this file means to spool */
	readonly note?: string;
	/** written while you watch */
	readonly fresh?: boolean;
}

export function Disk({ path, children }: { path: string; children: ReactNode }) {
	return (
		<div className="flex flex-col">
			<div className="flex h-9 items-center border-border border-b px-4">
				<span className="truncate font-mono text-2xs text-muted/70 leading-3">{path}</span>
			</div>
			<div className="flex flex-col py-2">{children}</div>
		</div>
	);
}

export function DiskRow({
	node,
	active = false,
	onPick,
}: {
	node: DiskNode;
	active?: boolean;
	onPick?: (() => void) | undefined;
}) {
	const dir = node.kind === "dir";
	return (
		<motion.button
			type="button"
			layout
			initial={node.fresh === true ? { opacity: 0, x: -8 } : false}
			animate={{ opacity: 1, x: 0 }}
			transition={{ type: "spring", stiffness: 420, damping: 38 }}
			onClick={onPick}
			className={cn(
				"group relative flex h-7 w-full items-center gap-2 pr-4 text-left transition-colors",
				active ? "bg-surface" : "hover:bg-surface/60",
			)}
			style={{ paddingLeft: 16 + node.depth * 16 }}
		>
			{active ? <span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" /> : null}
			{dir ? (
				<FolderIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-thread" : "text-muted")} />
			) : (
				<FrameIcon
					className={cn(
						"h-3.5 w-3.5 shrink-0",
						active ? "text-thread" : node.kind === "sidecar" ? "text-muted/50" : "text-muted",
					)}
				/>
			)}
			<span
				className={cn(
					"min-w-0 truncate font-mono text-xs leading-xs",
					active ? "text-text" : node.kind === "sidecar" ? "text-muted/60" : "text-muted",
				)}
			>
				{node.name}
			</span>
			{node.note === undefined ? null : (
				<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">{node.note}</span>
			)}
		</motion.button>
	);
}

/* ── the code block ────────────────────────────────────────────────────── */

const TOKEN =
	/(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|function|return|const|let|type|interface|as|new|await)\b|(<\/?[A-Za-z][\w.]*|\/>)|([{}()[\];,:=])/g;

interface Piece {
	readonly text: string;
	readonly tone: "comment" | "string" | "keyword" | "tag" | "punct" | "plain";
}

function pieces(line: string): readonly Piece[] {
	const out: Piece[] = [];
	let last = 0;
	TOKEN.lastIndex = 0;
	let match = TOKEN.exec(line);
	while (match !== null) {
		if (match.index > last) out.push({ text: line.slice(last, match.index), tone: "plain" });
		const tone: Piece["tone"] =
			match[1] !== undefined
				? "comment"
				: match[2] !== undefined
					? "string"
					: match[3] !== undefined
						? "keyword"
						: match[4] !== undefined
							? "tag"
							: "punct";
		out.push({ text: match[0], tone });
		last = match.index + match[0].length;
		match = TOKEN.exec(line);
	}
	if (last < line.length) out.push({ text: line.slice(last), tone: "plain" });
	return out;
}

const TONE: Record<Piece["tone"], string> = {
	comment: "text-muted/45",
	string: "text-text/55",
	keyword: "text-muted",
	tag: "text-text/70",
	punct: "text-muted/60",
	plain: "text-text/85",
};

export function Code({
	file,
	lines,
	mark = [],
	hot = [],
	className,
}: {
	/** the path this source sits at, drawn as the block's own header */
	file?: string | undefined;
	lines: readonly string[];
	/** the lines this frame is actually about */
	mark?: readonly number[];
	/** words drawn in the thread wherever they appear */
	hot?: readonly string[];
	className?: string | undefined;
}) {
	return (
		<div className={cn("flex flex-col overflow-hidden rounded-md border border-border bg-canvas", className)}>
			{file === undefined ? null : (
				<div className="flex h-8 shrink-0 items-center border-border border-b px-3">
					<span className="truncate font-mono text-2xs text-muted/70 leading-3">{file}</span>
				</div>
			)}
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				<AnimatePresence initial={false} mode="popLayout">
					{lines.map((line, index) => (
						<motion.div
							key={`${index}-${line}`}
							layout
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.16 }}
							className={cn("relative flex h-[19px] items-center pr-3 pl-3", mark.includes(index) && "bg-thread/[0.07]")}
						>
							{mark.includes(index) ? <span className="absolute top-0 bottom-0 left-0 w-[2px] bg-thread" /> : null}
							<span className="whitespace-pre font-mono text-xs leading-[19px]" style={{ tabSize: 2 }}>
								{pieces(line).map((piece, at) => (
									<span
										key={`${at}-${piece.text}`}
										className={hot.some((word) => piece.text.includes(word)) ? "text-thread" : TONE[piece.tone]}
									>
										{piece.text}
									</span>
								))}
							</span>
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</div>
	);
}

/**
 * The one sentence a file layout has to earn: what spool does with what is on
 * disk. It sits under the tree rather than over it, because the tree is the
 * argument and this is the conclusion.
 */
export function Rule({ children }: { children: ReactNode }) {
	return (
		<p className="max-w-[520px] text-base text-muted leading-base">{children}</p>
	);
}

/** the split every authoring frame uses: disk on the left, what it means on the right */
export function DiskSplit({
	left,
	right,
	name,
	argues,
	width = 620,
}: {
	left: ReactNode;
	right: ReactNode;
	/** the take's own name and the one line it argues, for scanning the page */
	name?: string | undefined;
	argues?: string | undefined;
	width?: number;
}) {
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex shrink-0 flex-col border-border border-r" style={{ width }}>
				{left}
			</div>
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				{name === undefined ? null : <Argues name={name} argues={argues} />}
				{right}
			</div>
		</div>
	);
}
