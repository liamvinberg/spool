interface IconProps {
	className?: string;
}

export function PlayIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path d="M4 2.5 13 8 4 13.5Z" fill="currentColor" />
		</svg>
	);
}

export function PlusIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

export function BackIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path
				d="m10 3.5-4.5 4.5 4.5 4.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function RestartIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path
				d="M9.4 3.25a5 5 0 1 1-3.1.05M8.4 1.5 6.3 3.3 8 5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function MotionIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 14 14" className={className} aria-hidden="true">
			<path
				d="M1.5 7Q3.25 2.8 5 7t3.5 0T12 7"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function CloseIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

export function CheckIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 20 20" className={className} aria-hidden="true">
			<path
				d="m4.5 10.5 4 4 7-8"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function ThreadIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path
				d="M2.5 12.5C6.5 12.5 9.5 3.5 12.5 3.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
			<path d="M14.5 3.5 10.8 1.8v3.4Z" fill="currentColor" />
		</svg>
	);
}

/**
 * agent — a mark and a line, twice: the rail drawn as itself (#144).
 *
 * It says what the pane is rather than who is answering in it. #115 ships three
 * adapters behind the same rail, so a glyph borrowed from one vendor's mark would be
 * wrong on the day the second one lands — and a speech bubble was drawn first and
 * lost for being somebody else's product rather than this one's.
 */
export function AgentIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="3.2" cy="5.4" r="1.15" fill="currentColor" />
			<circle cx="3.2" cy="10.6" r="1.15" fill="currentColor" />
			<path d="M6.4 5.4h7.2M6.4 10.6h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

/**
 * connections — two frames and the walk between them (#144).
 *
 * The flow arrow was the obvious borrow and it is already the header's threads
 * toggle, so it would mean two things in one window. This draws what the pane
 * actually lists instead: a frame, another frame, and the edge that joins them.
 */
export function ConnectionsIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="4.2" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="11.8" cy="11.4" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5.7 6.1 10.3 9.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

export function InspectorIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<rect
				x="2.5"
				y="3.5"
				width="11"
				height="9"
				rx="1.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
			/>
			<path d="M10 4v8" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

export function ExpandIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path
				d="M9.5 3H13v3.5M6.5 13H3V9.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function CompressIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path
				d="M13 6.5H9.5V3M3 9.5h3.5V13"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function HintIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 14 14" className={className} aria-hidden="true">
			<rect x="2" y="3.5" width="10" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

/** interact — the plain arrow cursor: clicks reach the live app. */
export function CursorIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<path
				d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"
				fill="currentColor"
			/>
		</svg>
	);
}

/** select — the inspect glyph: a cursor picking an element inside a framed region. */
export function SelectIcon({ className }: IconProps) {
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

/** hand — pan the canvas (H, or hold space). */
export function HandIcon({ className }: IconProps) {
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

/** dots — the per-card menu on the projects registry. */
export function DotsIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
			<circle cx="8" cy="8" r="1.25" fill="currentColor" />
			<circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
		</svg>
	);
}

/** search — filters the registry by name or path. */
export function SearchIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
			<path d="m10.3 10.3 3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

export function FolderIcon({ className }: IconProps) {
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

export function ChevronIcon({ open, className }: IconProps & { open?: boolean }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={`${className ?? ""} origin-center transition-transform duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${open === true ? "rotate-90" : ""}`}
			fill="none"
			aria-hidden="true"
		>
			<path d="m4 2.5 3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function PanelCaret({ dir, className }: IconProps & { dir: "left" | "right" }) {
	const d = dir === "left" ? "m7.5 3.5-4 4.5 4 4.5" : "m4.5 3.5 4 4.5-4 4.5";
	return (
		<svg viewBox="0 0 12 16" className={className} fill="none" aria-hidden="true">
			<path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/**
 * properties — two knobs on two rails, the glyph the shipped strip already
 * wears (`src/ui/icons.tsx`). It says what the column is for, adjusting values,
 * rather than naming a kind of thing.
 */
export function PropertiesIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
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

/** Edge: the play tab's bar, one dot at each end of the line it peels in on. */
export function EdgeIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="4.2" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="11.8" cy="11.4" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5.7 6.1 10.3 9.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

/** Edit: the hand tool that writes a frame's source (#253). */
export function EditIcon({ className }: IconProps) {
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
