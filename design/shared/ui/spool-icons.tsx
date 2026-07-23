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

export function HintIcon({ className }: IconProps) {
	return (
		<svg viewBox="0 0 14 14" className={className} aria-hidden="true">
			<rect x="2" y="3.5" width="10" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}
