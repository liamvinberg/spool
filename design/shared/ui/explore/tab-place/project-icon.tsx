import type { CSSProperties, ReactNode } from "react";
import type { IconArt, PlaceTab, PlaceTeam, ProjectIcon } from "shared/lib/explore/tab-place/tabs";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * A project's icon and the team mark, and the three ways a tab can hold both:
 *
 * - `badge`: the project icon leads, and a team project's copy wears its team's mark small in the icon's corner.
 *   A pause hollows the badge.
 * - `ring`: the project icon leads inside a ring in the team's colour. A pause breaks the ring into dashes.
 * - `either`: one or the other. The project icon when there is one, the team's mark when there isn't. A pause
 *   greys an icon out and hollows a mark.
 *
 * `mark` is the decided tab-place take with no project icons, the row these three are drawn against.
 */
export type IconTake = "mark" | "badge" | "ring" | "either";

/** Home's team letter-mark hues (`src/ui/teams.tsx`), picked by the same sum. */
const TEAM_HUES = ["#2E5D70", "#6B4E2E", "#4E3F70", "#2F6150", "#70393F"];
export const teamHue = (team: PlaceTeam) =>
	TEAM_HUES[[...team.address].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % TEAM_HUES.length] ?? "#2E5D70";

/** The no-icon colours: brighter than the team hues and only ever a tint, so a letter never reads as a team. */
const NAME_HUES = ["#5B8DEF", "#D9874E", "#A87BE0", "#4FAF8E", "#D9627A", "#C2A040"];
export const nameHue = (name: string) =>
	NAME_HUES[[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % NAME_HUES.length] ?? "#5B8DEF";

/** Home's team mark: filled while the copy syncs, hollow while sync is paused. */
export function TeamMark({
	team,
	paused = false,
	size = 16,
	cut,
}: {
	team: PlaceTeam;
	paused?: boolean | undefined;
	size?: number | undefined;
	/** the colour behind it, drawn as a gap round the mark when it sits on an icon */
	cut?: string | undefined;
}) {
	const ring = paused ? "inset 0 0 0 1.25px var(--color-muted)" : undefined;
	const gap = cut === undefined ? undefined : `0 0 0 1.5px ${cut}`;
	return (
		<span
			aria-hidden="true"
			className={cn("grid shrink-0 place-items-center font-semibold leading-none", paused ? "text-muted" : "text-[#EDEDED]")}
			style={{
				width: size,
				height: size,
				borderRadius: Math.max(2.5, size / 4),
				fontSize: Math.max(6.5, Math.round(size * 0.56)),
				background: paused ? (cut ?? "transparent") : teamHue(team),
				boxShadow: [ring, gap].filter(Boolean).join(", ") || undefined,
			}}
		>
			{[...team.name][0]?.toUpperCase()}
		</span>
	);
}

/** The project's own icon: its file, its repo's favicon, or its first letter on a tint picked from its name. */
export function ProjectIconView({
	icon,
	name,
	size = 16,
	dim = false,
}: {
	icon?: ProjectIcon | undefined;
	name: string;
	size?: number | undefined;
	/** greyed out: the either take's pause */
	dim?: boolean | undefined;
}) {
	const style: CSSProperties = { width: size, height: size, borderRadius: Math.max(3, size * 0.24) };
	if (icon === undefined) {
		const hue = nameHue(name);
		return (
			<span
				aria-hidden="true"
				className={cn("grid shrink-0 place-items-center font-semibold leading-none", dim && "opacity-45 grayscale")}
				style={{
					...style,
					fontSize: Math.round(size * 0.66),
					paddingBottom: Math.round(size * 0.06),
					background: `color-mix(in srgb, ${hue} 24%, transparent)`,
					boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 40%, transparent)`,
					color: `color-mix(in srgb, ${hue} 70%, white)`,
				}}
			>
				{[...name][0]?.toLowerCase()}
			</span>
		);
	}
	const art = ARTS[icon.art];
	return (
		<span
			aria-hidden="true"
			className={cn("grid shrink-0 place-items-center overflow-hidden", dim && "opacity-40 grayscale")}
			style={{ ...style, background: art.bg }}
		>
			{art.draw}
		</span>
	);
}

/** What leads a tab's name in each take. `cut` is the tab's own background, for the badge's gap. */
export function TabIcon({ tab, take, size = 16, cut = "var(--color-bg)" }: { tab: PlaceTab; take: IconTake; size?: number; cut?: string }) {
	const team = tab.place.kind === "team" ? tab.place.team : undefined;
	const paused = tab.place.kind === "team" && tab.place.paused !== undefined;
	if (take === "mark") return team === undefined ? null : <TeamMark team={team} paused={paused} size={size} />;
	if (take === "either") {
		if (team !== undefined && tab.icon === undefined) return <TeamMark team={team} paused={paused} size={size} />;
		return <ProjectIconView icon={tab.icon} name={tab.name} size={size} dim={paused} />;
	}
	const own = <ProjectIconView icon={tab.icon} name={tab.name} size={take === "ring" ? size - 2 : size} />;
	if (team === undefined) return take === "ring" ? <span className="grid shrink-0 place-items-center" style={{ width: size + 4, height: size + 4 }}>{own}</span> : own;
	if (take === "badge") {
		const badge = Math.round(size * 0.62);
		return (
			<span className="relative shrink-0" style={{ width: size, height: size }}>
				{own}
				<span className="absolute" style={{ right: -Math.round(badge * 0.36), bottom: -Math.round(badge * 0.36) }}>
					<TeamMark team={team} paused={paused} size={badge} cut={cut} />
				</span>
			</span>
		);
	}
	// ring: the icon shrinks by two so the ring sits inside the same box a badge's icon fills
	const outer = size + 4;
	const radius = Math.max(4, (size - 2) * 0.24 + 2.5);
	return (
		<span className="relative grid shrink-0 place-items-center" style={{ width: outer, height: outer }}>
			<svg width={outer} height={outer} className="absolute inset-0" aria-hidden="true">
				<rect
					x={0.75}
					y={0.75}
					width={outer - 1.5}
					height={outer - 1.5}
					rx={radius}
					fill="none"
					stroke={paused ? "var(--color-muted)" : `color-mix(in srgb, ${teamHue(team)} 62%, white)`}
					strokeWidth={1.5}
					strokeDasharray={paused ? "2.4 2.2" : undefined}
				/>
			</svg>
			{own}
		</span>
	);
}

/** The pictures the fixtures' icon files hold, on a 24 grid. */
const ARTS: Record<IconArt, { bg: string; draw: ReactNode }> = {
	spool: { bg: "#f5391a", draw: <SpoolMark className="h-[64%] w-[64%] text-white" /> },
	bag: {
		bg: "#E8973A",
		draw: (
			<Glyph>
				<path d="M6.5 9.5h11l-1 9h-9z" fill="#2A1A08" />
				<path d="M9.5 9.5V8a2.5 2.5 0 0 1 5 0v1.5" stroke="#2A1A08" strokeWidth="1.8" fill="none" strokeLinecap="round" />
			</Glyph>
		),
	},
	compass: {
		bg: "#2F6FDB",
		draw: (
			<Glyph>
				<circle cx="12" cy="12" r="6.6" stroke="white" strokeWidth="1.7" fill="none" />
				<path d="M12 7.6 13.9 12 12 16.4 10.1 12z" fill="white" />
			</Glyph>
		),
	},
	bean: {
		bg: "#EFE3CF",
		draw: (
			<Glyph>
				<ellipse cx="12" cy="12" rx="5" ry="7" transform="rotate(35 12 12)" fill="#6B3E1F" />
				<path d="M8.6 16.6c2.6-1.6 1.2-4.4 3.4-6.2 1.2-1 2.6-1.4 3.4-3.1" stroke="#EFE3CF" strokeWidth="1.4" fill="none" strokeLinecap="round" />
			</Glyph>
		),
	},
	note: {
		bg: "#F7CF46",
		draw: (
			<Glyph>
				<path d="M7 8h10M7 12h10M7 16h6" stroke="#3A2F0B" strokeWidth="1.9" strokeLinecap="round" />
			</Glyph>
		),
	},
	grid: {
		bg: "#7C5CE0",
		draw: (
			<Glyph>
				<rect x="6" y="6" width="5" height="5" rx="1.2" fill="white" />
				<rect x="13" y="6" width="5" height="5" rx="1.2" fill="white" fillOpacity=".55" />
				<rect x="6" y="13" width="5" height="5" rx="1.2" fill="white" fillOpacity=".55" />
				<rect x="13" y="13" width="5" height="5" rx="1.2" fill="white" />
			</Glyph>
		),
	},
	spark: {
		bg: "#E2477F",
		draw: (
			<Glyph>
				<path d="M12 4.8c.6 4 2.6 6.4 7.2 7.2-4.6.8-6.6 3.2-7.2 7.2-.6-4-2.6-6.4-7.2-7.2 4.6-.8 6.6-3.2 7.2-7.2z" fill="white" />
			</Glyph>
		),
	},
	receipt: {
		bg: "#1FA67A",
		draw: (
			<Glyph>
				<path d="M7 5h10v14l-1.7-1.2-1.6 1.2-1.7-1.2-1.7 1.2-1.6-1.2L7 19z" fill="white" />
				<path d="M9.5 9h5M9.5 12h5M9.5 15h3" stroke="#1FA67A" strokeWidth="1.4" strokeLinecap="round" />
			</Glyph>
		),
	},
	brick: {
		bg: "#5C6B7A",
		draw: (
			<Glyph>
				<path d="M5.5 7.5h13v9h-13zM5.5 12h13M10 7.5V12M14.5 12v4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
			</Glyph>
		),
	},
};

function Glyph({ children }: { children: ReactNode }) {
	return (
		<svg viewBox="0 0 24 24" className="h-full w-full" fill="none" aria-hidden="true">
			{children}
		</svg>
	);
}
