import { type ReactNode, type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export const LABEL = "font-mono text-2xs leading-3";

export const VALUE = "font-mono text-sm leading-4";

export const FAINT = "font-mono text-2xs text-muted/50 leading-3";

export const BOX =
	"rounded-xs border border-transparent hover:border-border hover:bg-surface focus-within:border-border-raised focus-within:bg-surface";

export function Row({
	name,
	ok = true,
	tall = false,
	changed = false,
	onScrub,
	onScrubEnd,
	children,
}: {
	name: string;
	ok?: boolean;
	/** a control taller than one line: the label sits at the top of it */
	tall?: boolean;
	/** the label reads in thread colour when the value under it is not the file's */
	changed?: boolean;
	/** a numeric row: dragging the label steps the value by the units crossed */
	onScrub?: ((units: number) => void) | undefined;
	/** the pointer let go: whatever the scrub was making is done being made */
	onScrubEnd?: (() => void) | undefined;
	children: ReactNode;
}) {
	const scrub = useRef<{ from: number; sent: number } | null>(null);
	const down = (event: ReactPointerEvent<HTMLSpanElement>) => {
		if (onScrub === undefined || !ok) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		scrub.current = { from: event.clientX, sent: 0 };
	};
	const move = (event: ReactPointerEvent<HTMLSpanElement>) => {
		const held = scrub.current;
		if (held === null || onScrub === undefined) return;
		const units = Math.round((event.clientX - held.from) / 4);
		if (units === held.sent) return;
		onScrub(units - held.sent);
		held.sent = units;
	};
	const up = (event: ReactPointerEvent<HTMLSpanElement>) => {
		if (scrub.current === null) return;
		event.currentTarget.releasePointerCapture(event.pointerId);
		scrub.current = null;
		onScrubEnd?.();
	};
	const long = name.length > 14;
	return (
		<div
			data-properties-row={name}
			className={cn(
				"grid grid-cols-[92px_1fr] items-center gap-2 border-border/80 border-b px-2.5",
				tall ? "py-1.5" : long ? "min-h-7 py-1" : "h-7",
			)}
		>
			<span
				onPointerDown={down}
				onPointerMove={move}
				onPointerUp={up}
				onPointerCancel={up}
				className={cn(
					tall ? "self-start pt-1.5 leading-3.5" : long ? "break-words leading-3.5" : "truncate",
					LABEL,
					"select-none",
					changed ? "text-thread" : ok ? "text-muted" : "text-muted/40",
					onScrub !== undefined && ok && "cursor-ew-resize hover:text-text",
				)}
			>
				{name}
			</span>
			<div className="flex min-w-0 items-center gap-1">{children}</div>
		</div>
	);
}

export function Section({
	name,
	reason,
	aside,
	children,
}: {
	name: string;
	reason?: string | undefined;
	aside?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="border-border-raised border-t">
			<div className="flex h-6 items-center gap-2 px-2.5">
				<span className={cn("shrink-0 text-muted/70", LABEL)}>{name}</span>
				{aside}
				{reason === undefined ? null : <span className={cn("ml-auto min-w-0 truncate", FAINT)}>{reason}</span>}
			</div>
			{children}
		</div>
	);
}

export function NumField({
	value,
	readout,
	ok,
	changed = false,
	faint = false,
	placeholder,
	onCommit,
	onStep,
	className,
}: {
	value: string;
	/** what the token measures: `16px`, `50%`, `12deg` */
	readout?: string | null | undefined;
	ok: boolean;
	changed?: boolean;
	/** the value is inherited from the base scope or a fallback: read it quietly */
	faint?: boolean;
	placeholder?: string | undefined;
	onCommit: (typed: string) => void;
	/** whole units, signed: arrows send 1, shift sends 10 */
	onStep?: ((units: number) => void) | undefined;
	className?: string;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	if (!ok) {
		return (
			<span className={cn("flex min-w-0 flex-1 items-center gap-1 px-1", className)}>
				<span className={cn("min-w-0 flex-1 truncate text-muted/40", VALUE)}>
					{value === "" ? (placeholder ?? "") : value}
				</span>
				{readout === undefined || readout === null ? null : (
					<span className={cn("shrink-0", FAINT)}>{readout}</span>
				)}
			</span>
		);
	}
	return (
		<label className={cn("flex min-w-0 flex-1 items-center gap-1 px-1", BOX, className)}>
			<input
				value={draft ?? value}
				placeholder={placeholder}
				spellCheck={false}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={(event) => event.target.select()}
				onBlur={() => {
					if (draft !== null && draft !== value) onCommit(draft);
					setDraft(null);
				}}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "Enter") {
						if (draft !== null && draft !== value) onCommit(draft);
						setDraft(null);
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						setDraft(null);
						event.currentTarget.blur();
					}
					if ((event.key === "ArrowUp" || event.key === "ArrowDown") && onStep !== undefined) {
						event.preventDefault();
						setDraft(null);
						onStep((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1));
					}
				}}
				className={cn(
					"min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/40",
					VALUE,
					changed ? "text-thread" : faint ? "text-muted/55" : "text-text",
				)}
			/>
			{readout === undefined || readout === null ? null : <span className={cn("shrink-0", FAINT)}>{readout}</span>}
		</label>
	);
}
