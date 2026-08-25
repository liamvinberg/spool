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

/** `currentColor`, so a button that lightens on hover takes its plus with it */
export function PlusIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
			<path d="M5 1 L5 9 M1 5 L9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

/**
 * The edge glyph (#151): two frames and the walk between them. It replaced the
 * single arrow when the toggle stopped governing only arrows — the layer draws
 * a walk whether or not this canvas can show the frame at its far end, and an
 * arrow was only ever half of what the switch did.
 */
export function EdgeIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="4.2" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="11.8" cy="11.4" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5.7 6.1 10.3 9.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

/**
 * The agent rail, on the strip it collapses to (#144, #192): a mark and a line,
 * twice — the rail drawn as itself.
 *
 * It says what the pane is rather than who is answering in it. #115 ships one rail
 * over more than one adapter, so a glyph borrowed from a vendor's mark would be
 * wrong the day a second one lands, and a speech bubble is somebody else's product
 * rather than this one's.
 */
export function AgentIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="3.2" cy="5.4" r="1.15" fill="currentColor" />
			<circle cx="3.2" cy="10.6" r="1.15" fill="currentColor" />
			<path d="M6.4 5.4h7.2M6.4 10.6h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

/**
 * The properties rail's strip (#256).
 *
 * Two knobs on two rails: what the column is for is adjusting values, and the
 * glyph says that rather than naming a kind of thing. It stands at ninety
 * degrees to `AgentIcon`, which is the other thing the column can hold, so the
 * two strips are told apart at a glance rather than read.
 */
export function PropertiesIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M5.5 2.4v3.1M5.5 9.1v4.5M10.5 2.4v6.3M10.5 12.3v1.3"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
			<circle cx="5.5" cy="7.3" r="1.5" fill="currentColor" />
			<circle cx="10.5" cy="10.5" r="1.5" fill="currentColor" />
		</svg>
	);
}

/** The per-card menu on home. */
export function DotsIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
			<circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
			<circle cx="8" cy="8" r="1.25" fill="currentColor" />
			<circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
		</svg>
	);
}

/** Home's registry filter. */
export function SearchIcon({ className }: { className?: string }) {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
			<path d="m10.3 10.3 3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

/** A folder, wherever spool names one: a page in the rail, a directory in the picker. */
export function FolderIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
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
