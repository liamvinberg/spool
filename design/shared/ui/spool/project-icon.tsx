import { createContext, type ReactNode, useContext } from "react";
import { type IconArt, nameHue, type ProjectIcon } from "shared/lib/spool/project-icon";
import { SpoolMark } from "shared/ui/spool/mark";
import { type MarkTeam, TEAMS, TeamMark } from "shared/ui/spool/teams";

/**
 * A project's icon, the same wherever it is drawn: on its tab, in its tab's menu, on its cover at Home.
 * Mirrors `src/ui/project-icon.tsx`; the picture the daemon would serve by hash is a drawing named by the
 * fixture (`shared/lib/spool/project-icon.ts`), and a team the context doesn't know is drawn from its address.
 *
 * A team project's local copy wears its team's mark small in the icon's bottom-right corner, hollow while the
 * copy's sync is paused.
 */

/**
 * The teams this Mac knows, by address, for the badge's logo and letter. Here it starts with the fixture
 * account's teams, which is what the account's team list would answer.
 */
export const ProjectTeams = createContext<ReadonlyMap<string, MarkTeam>>(new Map(TEAMS.map((team) => [team.address, team])));

export function useMarkTeam(address: string | undefined): MarkTeam | undefined {
	const teams = useContext(ProjectTeams);
	if (address === undefined) return undefined;
	return teams.get(address) ?? { address, name: address, logo: null };
}

/** The project's own picture, or its letter. */
export function ProjectIconView({
	name,
	icon,
	size = 16,
}: {
	name: string;
	icon?: ProjectIcon | undefined;
	size?: number;
}) {
	const radius = Math.max(3, size * 0.24);
	if (icon !== undefined) {
		const art = ARTS[icon.art];
		return (
			<span
				aria-hidden="true"
				data-project-icon={icon.from}
				className="grid shrink-0 place-items-center overflow-hidden"
				style={{ width: size, height: size, borderRadius: radius, background: art.bg }}
			>
				{art.draw}
			</span>
		);
	}
	const hue = nameHue(name);
	return (
		<span
			aria-hidden="true"
			data-project-icon="letter"
			className="grid shrink-0 place-items-center font-semibold leading-none"
			style={{
				width: size,
				height: size,
				borderRadius: radius,
				fontSize: Math.round(size * 0.66),
				paddingBottom: Math.round(size * 0.06),
				background: `color-mix(in srgb, ${hue} 24%, transparent)`,
				boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 40%, transparent)`,
				// a pale letter on a dark field, a deep one on a light field
				color: `light-dark(color-mix(in srgb, ${hue} 78%, black), color-mix(in srgb, ${hue} 70%, white))`,
			}}
		>
			{[...name][0]?.toLowerCase()}
		</span>
	);
}

/**
 * The icon with its team badge, when it has one: the badge is about 62% of the icon, set out past its corner by
 * about a third of itself, with a gap ring in `cut`, the colour behind it.
 */
export function ProjectMark({
	name,
	icon,
	team,
	paused = false,
	size = 16,
	cut = "var(--color-bg)",
}: {
	name: string;
	icon?: ProjectIcon | undefined;
	/** The team a team project's local copy belongs to, by address. */
	team?: string | undefined;
	paused?: boolean | undefined;
	size?: number;
	cut?: string;
}) {
	const markTeam = useMarkTeam(team);
	const own = <ProjectIconView name={name} icon={icon} size={size} />;
	if (markTeam === undefined) return own;
	const badge = Math.round(size * 0.62);
	const out = -Math.round(badge * 0.36);
	return (
		<span className="relative block shrink-0" style={{ width: size, height: size }}>
			{own}
			<span className="absolute flex" style={{ right: out, bottom: out }}>
				<TeamMark team={markTeam} size={badge} paused={paused} cut={cut} />
			</span>
		</span>
	);
}

/** The pictures the fixtures' icon files hold, on a 24 grid: what the daemon would serve by hash. */
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
