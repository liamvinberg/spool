// Verbatim Home icons from src/ui/icons.tsx.
export function CogIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M13.23 6.66 14.93 7.01v1.98l-1.7.35-.58 1.41.95 1.45-1.4 1.4-1.45-.95-1.41.58-.35 1.7H7.01l-.35-1.7-1.41-.58-1.45.95-1.4-1.4.95-1.45-.58-1.41-1.7-.35V7.01l1.7-.35.58-1.41-.95-1.45 1.4-1.4 1.45.95 1.41-.58.35-1.7h1.98l.35 1.7 1.41.58 1.45-.95 1.4 1.4-.95 1.45.58 1.41Z"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinejoin="round"
			/>
			<circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
		</svg>
	);
}

export function SearchIcon({ className }: { className?: string }) {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
			<path d="m10.3 10.3 3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

export function ArrowRightIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" aria-hidden="true">
			<path d="M3 8h10M9 4l4 4-4 4" />
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

export function DotsIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
			<circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
			<circle cx="8" cy="8" r="1.25" fill="currentColor" />
			<circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
		</svg>
	);
}

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

export function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

export function PlusIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
			<path d="M5 1 L5 9 M1 5 L9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}
