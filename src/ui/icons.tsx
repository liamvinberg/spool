import { SPOOL_MARK_PATH } from "../brand";

/**
 * The mark and the 16px/1.5-stroke icon set from the Paper file's system page
 * (#13). The ribbon is the logo, thread-red vector, exported verbatim.
 */

export function RibbonMark({ className }: { className?: string }) {
	return (
		<svg viewBox="250 182 524 660" className={className} aria-hidden="true">
			<path d={SPOOL_MARK_PATH} fillRule="evenodd" fill="var(--color-thread)" />
		</svg>
	);
}

export function PlayIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
			<path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="var(--color-text)" />
		</svg>
	);
}

export function PlusIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
			<path
				d="M5 1 L5 9 M1 5 L9 5"
				fill="none"
				stroke="var(--color-muted)"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function BackIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
			<path
				d="M10 3 L5 8 L10 13"
				fill="none"
				stroke="var(--color-muted)"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** The thread glyph (#34): one arrow of the map, tail to head. */
export function ThreadIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
			<path
				d="M2.5 12.5 C 6.5 12.5, 9.5 3.5, 12.5 3.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
			<path d="M14.5 3.5 L10.8 1.8 L10.8 5.2 Z" fill="currentColor" stroke="none" />
		</svg>
	);
}

export function CloseIcon() {
	return (
		<svg width="8" height="8" viewBox="0 0 16 16" aria-hidden="true">
			<path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
		</svg>
	);
}
