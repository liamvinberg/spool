const PATHS = {
	down: "M8 2.5v10m-4-4 4 4 4-4",
	arrow: "M3 13 13 3M4 3h9v9",
	right: "M2.5 8h10m-4-4 4 4-4 4",
	copy: "M5.5 5.5h8v8h-8zM10.5 3V2.5h-8v8H3",
	check: "m3 8 3.2 3.2L13 4.5",
	close: "m4 4 8 8m0-8-8 8",
} as const;

export function GuideIcon({ name }: { name: keyof typeof PATHS }) {
	return (
		<svg
			className={`sg-icon sg-icon-${name}`}
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
		>
			<path d={PATHS[name]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
