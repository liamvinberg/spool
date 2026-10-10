import { createContext, useContext, useState } from "react";
import { iconUrl, type ProjectIcon } from "./api";
import { cn } from "./cn";
import { LetterMark, type MarkSize } from "./primitives/display";
import { type MarkTeam, TeamMark } from "./teams";

/**
 * A project's icon, the same wherever it is drawn: on its tab, in its tab's menu, on its cover at Home.
 *
 * The daemon finds the picture (`src/daemon/project-icon.ts`): the project's `design/shared/icon.*`, or its repo's
 * favicon. With neither, the name's first letter stands in, lowercase on a tint picked from the name. The tints are
 * brighter than the team hues and only ever a tint, so a letter never reads as a team.
 *
 * A team project's local copy wears its team's mark small in the icon's bottom-right corner, hollow while the
 * copy's sync is paused.
 */

const NAME_HUES = ["#5B8DEF", "#D9874E", "#A87BE0", "#4FAF8E", "#D9627A", "#C2A040"];

export function nameHue(name: string): string {
	return NAME_HUES[[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % NAME_HUES.length] ?? "#5B8DEF";
}

/**
 * The teams this Mac knows, by address, for the badge's logo and letter. A team the account can't see right now
 * (signed out, spool.page unreachable) is drawn from its address.
 */
export const ProjectTeams = createContext<ReadonlyMap<string, MarkTeam>>(new Map());

export function useMarkTeam(address: string | undefined): MarkTeam | undefined {
	const teams = useContext(ProjectTeams);
	if (address === undefined) return undefined;
	return teams.get(address) ?? { address, name: address, logo: null };
}

/** The mark's two sizes in pixels, for the team badge's sums: on a tab, and in a menu or on a card. */
const MARK_PX: Record<MarkSize, number> = { sm: 16, md: 20 };

/** The project's own picture, or its letter. */
export function ProjectIconView({
	project,
	name,
	icon,
	size = "sm",
}: {
	/** The project's registered name, which the icon's address is under. */
	project: string;
	name: string;
	icon?: ProjectIcon | undefined;
	size?: MarkSize;
}) {
	// an address that answers nothing (the file changed under it) falls back to the letter until the next icon
	const [broken, setBroken] = useState<string | null>(null);
	if (icon !== undefined && broken !== icon.hash) {
		return (
			<img
				src={iconUrl(project, icon.hash)}
				alt=""
				draggable={false}
				data-project-icon={icon.from}
				className={cn("block shrink-0 rounded-xs object-cover", size === "sm" ? "size-4" : "size-5")}
				onError={() => setBroken(icon.hash)}
			/>
		);
	}
	return <LetterMark name={name} size={size} hue={nameHue(name)} data-project-icon="letter" />;
}

/**
 * The icon with its team badge, when it has one: the badge is about 62% of the icon, set out past its corner by
 * about a third of itself, with a gap ring in `cut`, the colour behind it.
 */
export function ProjectMark({
	project,
	name,
	icon,
	team,
	paused = false,
	size = "sm",
	cut = "var(--color-surface-window)",
}: {
	project: string;
	name: string;
	icon?: ProjectIcon | undefined;
	/** The team a team project's local copy belongs to, by address. */
	team?: string | undefined;
	paused?: boolean | undefined;
	size?: MarkSize;
	cut?: string;
}) {
	const markTeam = useMarkTeam(team);
	const own = <ProjectIconView project={project} name={name} icon={icon} size={size} />;
	if (markTeam === undefined) return own;
	const px = MARK_PX[size];
	const badge = Math.round(px * 0.62);
	const out = -Math.round(badge * 0.36);
	return (
		<span className="relative block shrink-0" style={{ width: px, height: px }}>
			{own}
			<span className="absolute flex" style={{ right: out, bottom: out }}>
				<TeamMark team={markTeam} size={badge} paused={paused} cut={cut} />
			</span>
		</span>
	);
}
