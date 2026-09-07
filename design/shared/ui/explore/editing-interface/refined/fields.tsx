import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";
import { cn } from "shared/lib/utils";
import { beginScrub } from "../reference/shared/lib/spool/scrub";

// Current properties-field markup and type roles, with the reviewed gesture contract.
export const LABEL = "type-detail";
export const VALUE = "type-value";
export const FAINT = "text-muted type-detail";
export const BOX =
	"rounded-xs border border-transparent hover:border-border hover:bg-surface focus-within:border-border-raised focus-within:bg-surface";

/* ---------- the row and the section ---------- */

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
	onScrub?: ((units: number, shift: boolean) => void) | undefined;
	/** the pointer let go: whatever the scrub was making is done being made */
	onScrubEnd?: ((cancelled: boolean) => void) | undefined;
	children: ReactNode;
}) {
	const scrub = useRef<(() => void) | null>(null);
	const latest = useRef({ onScrub, onScrubEnd });
	latest.current = { onScrub, onScrubEnd };
	useEffect(() => () => scrub.current?.(), []);
	const down = (event: ReactPointerEvent<HTMLSpanElement>) => {
		if (onScrub === undefined || !ok || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		scrub.current?.();
		scrub.current = beginScrub(
			event.currentTarget,
			event.nativeEvent,
			(units, shift) => latest.current.onScrub?.(units, shift),
			(cancelled) => {
				scrub.current = null;
				latest.current.onScrubEnd?.(cancelled);
			},
		);
	};
	const long = name.length > 13;
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
		<div data-properties-section={name} className="border-border-raised border-t">
			<div className="flex h-6 items-center gap-2 px-2.5">
				<span className={cn("shrink-0 text-muted/70", LABEL)}>{name}</span>
				{aside}
				{reason === undefined ? null : <span className={cn("ml-auto min-w-0 truncate", FAINT)}>{reason}</span>}
			</div>
			{children}
		</div>
	);
}
