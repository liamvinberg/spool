// Mirrors src/ui/team-moves.tsx: the team's projects not on this Mac, "Get it", and "Move to team…".
// The daemon's answers are the fixture below.

import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "./home-actions";
import type { Team } from "./teams";

/** A team project as Home's team page reads it from the daemon. */
export interface TeamProjectOnMac {
	name: string;
	repo: string | null;
	clone: string | null;
	checkouts: string[];
	home: string;
}

/** Tidemark's projects that aren't on Ada's Mac yet. */
export const TIDEMARK_AWAY: TeamProjectOnMac[] = [
	{
		name: "onboarding",
		repo: "github.com/tidemark/app",
		clone: "git clone https://github.com/tidemark/app.git",
		checkouts: ["~/code/tidemark-app"],
		home: "~/spool/tidemark/onboarding",
	},
	{ name: "pitch", repo: null, clone: null, checkouts: [], home: "~/spool/tidemark/pitch" },
];

/** The team's projects not on this Mac, dimmed, each with "Get it". */
export function AwayCovers({ projects, onGet }: { projects: readonly TeamProjectOnMac[]; onGet?: (name: string) => void }) {
	return (
		<section className="pj-away mt-[44px]" aria-label="Not on this Mac">
			<h2 className="mb-[18px] text-muted type-caption">Not on this Mac</h2>
			<div className="pj-covers-grid grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
				{projects.map((project) => (
					<article key={project.name} className="pj-away-cover min-w-0">
						<div className="relative grid aspect-[1.82] place-items-center rounded-[8px] border border-dashed border-border-raised bg-canvas opacity-60">
							<span className="px-[18px] text-center text-muted type-detail">{project.repo ?? "no repo linked"}</span>
						</div>
						<div className="flex items-center justify-between gap-[9px] pt-[15px]">
							<strong className="truncate text-muted type-title font-[500]">{project.name}</strong>
							<button type="button" className={cn("h-[30px]", HOME_ACTION)} onClick={() => onGet?.(project.name)}>
								Get it
							</button>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

/** The app's confirm dialog over Home, as src/ui/confirm-dialog.tsx draws it. */
function Sheet({ title, description, confirmLabel, children }: { title: string; description: string; confirmLabel: string; children: ReactNode }) {
	return (
		<div className="absolute inset-0 z-30 grid place-items-center bg-[color-mix(in_srgb,var(--color-bg)_70%,transparent)]">
			<div role="dialog" aria-modal="true" aria-label={title} className="w-[440px] rounded-[8px] border border-border-raised bg-surface p-[24px] text-text">
				<h2 className="m-0 mb-[8px] [font:var(--type-title)]">{title}</h2>
				<p className="m-0 mb-[20px] text-muted [font:var(--type-body)]">{description}</p>
				{children}
				<div className="mt-[24px] flex justify-end gap-[8px]">
					<button type="button" className={cn("home-action", HOME_ACTION)}>
						Cancel
					</button>
					<button type="button" className={cn("home-action home-action-primary", HOME_ACTION_PRIMARY)}>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

function Choice({ selected, title, detail, path = true }: { selected: boolean; title: string; detail: string; path?: boolean }) {
	return (
		<label className={cn("flex cursor-pointer items-start gap-[12px] rounded-[7px] border px-[13px] py-[11px]", selected ? "border-muted bg-control" : "border-border-raised")}>
			<input type="radio" readOnly className="mt-[3px] accent-[var(--color-thread)]" checked={selected} />
			<span className="flex min-w-0 flex-col gap-[3px]">
				<span className="type-control">{title}</span>
				<span className={cn("truncate text-muted", path ? "type-detail" : "type-label")}>{detail}</span>
			</span>
		</label>
	);
}

/** "Get it": a checkout here first, then one picked, then just this Mac; the clone command to copy. */
export function GetItSheet({ team, project }: { team: Team; project: TeamProjectOnMac }) {
	return (
		<Sheet
			title={`Get ${project.name}`}
			description={`Put ${team.name}’s ${project.name} on this Mac. Its design/ stays in step with the team and out of git.`}
			confirmLabel="Get it"
		>
			<div className="mb-[16px] flex flex-col gap-[8px]">
				{project.checkouts.map((path, index) => (
					<Choice key={path} selected={index === 0} title={`In ${path}`} detail={`Your checkout of ${project.repo}`} path={false} />
				))}
				<Choice selected={false} title="In a checkout…" detail="Choose a clone of the repo" path={false} />
				<Choice selected={project.checkouts.length === 0} title="Just on this Mac" detail={project.home} />
			</div>
			{project.clone !== null && (
				<div className="mb-[8px] flex flex-col gap-[6px]">
					<span className="text-muted type-label">Not cloned yet? Clone {project.repo} yourself, then Get it there:</span>
					<code className="select-all overflow-x-auto rounded-[6px] border border-border-raised bg-bg px-[10px] py-[8px] type-detail">{project.clone}</code>
				</div>
			)}
		</Sheet>
	);
}

/** "Move to team…": which team, what the move does, and where history before it stays. */
export function MoveToTeamSheet({ project, teams }: { project: string; teams: readonly Team[] }) {
	const chosen = teams[0];
	return (
		<Sheet
			title={`Move ${project} to a team`}
			description={`spool uploads the whole project to ${chosen?.name ?? "the team"}, then makes one commit on your current branch that takes design/ out of git and adds spool.json. Nothing is pushed.`}
			confirmLabel={`Move to ${chosen?.name ?? "team"}`}
		>
			{teams.length > 1 && (
				<label className="mb-[14px] flex flex-col gap-[8px] type-control">
					Team
					<span className="flex h-[38px] items-center rounded-[7px] border border-border-raised bg-bg px-[11px] text-text">{chosen?.name}</span>
				</label>
			)}
			<p className="mb-[8px] text-muted type-label">History before the move stays in git.</p>
		</Sheet>
	);
}
