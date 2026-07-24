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

/** The inspector: one mark across canvas and player — a surface with a rail. */
export function InspectorIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
			<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
			<path d="M10 4v8" stroke="currentColor" strokeWidth="1.5" />
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

interface CanvasToolIconProps {
	className?: string;
}

/** Interact: the pointer that enters a live frame. */
export function CursorIcon({ className }: CanvasToolIconProps) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<path
				d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"
				fill="currentColor"
			/>
		</svg>
	);
}

/** Select: a pointer choosing an element inside a frame. */
export function SelectIcon({ className }: CanvasToolIconProps) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M12.03 12.68a.5.5 0 0 1 .65-.65l9 3.5a.5.5 0 0 1-.03.95l-3.45 1.06a1 1 0 0 0-.66.66l-1.06 3.45a.5.5 0 0 1-.95.03z"
				fill="currentColor"
			/>
			<path
				d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h2M14 3h1M3 9v1M21 9v2M3 14v1"
				stroke="currentColor"
				strokeWidth="1.9"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** Hand: the canvas panning tool. */
export function HandIcon({ className }: CanvasToolIconProps) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
