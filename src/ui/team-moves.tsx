import { useEffect, useState } from "react";
import {
	type CloudTeam,
	fetchTeamProjects,
	getTeamProjectAt,
	type HerePerson,
	type MoveOutcome,
	moveProjectToTeam,
	type TeamProjectOnMac,
} from "./api";
import { cn } from "./cn";
import { ConfirmDialog } from "./confirm-dialog";
import { HerePill } from "./home";
import { HOME_ACTION } from "./home-actions";
import { ProjectPicker } from "./picker";

/**
 * Getting a team project onto this Mac, and moving a project into a team (DEV-190). The daemon does the work; these
 * are the dimmed covers of what the team has that this Mac doesn't, the "Get it" sheet, and the "Move to team…" one.
 */

/** A path as a person reads it: the home folder as `~`. */
export function tilde(path: string): string {
	return path.replace(/^\/Users\/[^/]+(?=\/|$)/u, "~");
}

/**
 * The team's projects not yet on this Mac, dimmed, each with "Get it". Read once when it mounts: Home mounts it
 * again whenever this Mac's own projects change, so a project just got leaves the list. Nothing shows while
 * spool.page can't say.
 */
export function TeamProjectsAway({
	team,
	here,
	onGot,
}: {
	team: CloudTeam;
	/** Who is inside each of the team's projects now, by name: someone may be in one this Mac doesn't hold. */
	here?: ReadonlyMap<string, readonly HerePerson[]>;
	onGot: (project: { root: string; name: string }) => void;
}) {
	const [projects, setProjects] = useState<TeamProjectOnMac[] | undefined>();
	const [getting, setGetting] = useState<TeamProjectOnMac | null>(null);
	useEffect(() => {
		let current = true;
		void fetchTeamProjects(team.address).then((listed) => {
			if (current) setProjects(listed);
		});
		return () => {
			current = false;
		};
	}, [team.address]);
	const away = (projects ?? []).filter((project) => project.copies.length === 0);
	if (away.length === 0) return null;
	return (
		<section className="pj-away mt-[44px]" aria-label="Not on this Mac">
			<h2 className="mb-[18px] text-muted type-caption">Not on this Mac</h2>
			<div className="pj-covers-grid grid grid-cols-3 gap-x-[24px] gap-y-[34px] [@media(max-width:1050px)]:grid-cols-2 [@media(max-width:720px)]:grid-cols-1">
				{away.map((project) => (
					<article key={project.url} className="pj-away-cover min-w-0">
						<div className="relative">
							<div className="grid aspect-[1.82] place-items-center rounded-[8px] border border-dashed border-border-raised bg-canvas opacity-60">
								<span className="px-[18px] text-center text-muted type-detail">
									{project.repo ?? "no repo linked"}
								</span>
							</div>
							<HerePill people={here?.get(project.name)} />
						</div>
						<div className="flex items-center justify-between gap-[9px] pt-[15px]">
							<strong className="truncate text-muted type-title font-[500]">{project.name}</strong>
							<button
								type="button"
								className={cn("h-[30px]", HOME_ACTION)}
								aria-label={`Get ${project.name}`}
								onClick={() => setGetting(project)}
							>
								Get it
							</button>
						</div>
					</article>
				))}
			</div>
			{getting !== null && (
				<GetItDialog
					team={team}
					project={getting}
					onGot={(got) => {
						setGetting(null);
						onGot(got);
					}}
					onClose={() => setGetting(null)}
				/>
			)}
		</section>
	);
}

type Place = { kind: "checkout"; path: string } | { kind: "pick" } | { kind: "mac" };

/**
 * "Get it": a checkout of the project's repo already on this Mac first, then "In a checkout…" to pick another, then
 * "Just on this Mac" with no repo at all. Spool never clones: the repo's clone command is shown to copy.
 */
export function GetItDialog({
	team,
	project,
	onGot,
	onClose,
}: {
	team: CloudTeam;
	project: TeamProjectOnMac;
	onGot: (project: { root: string; name: string }) => void;
	onClose: () => void;
}) {
	const first = project.checkouts[0];
	const [place, setPlace] = useState<Place>(first === undefined ? { kind: "mac" } : { kind: "checkout", path: first });
	const [picked, setPicked] = useState<string | null>(null);
	const [picking, setPicking] = useState(false);
	if (picking)
		return (
			<ProjectPicker
				initial="location"
				location="~"
				onOpened={() => {}}
				onClose={() => setPicking(false)}
				onLocation={async (path) => {
					setPicked(path);
					setPlace({ kind: "pick" });
					return { ok: true };
				}}
			/>
		);
	/** One place; `detail` is a path, said as the machine says it, unless it is a sentence. */
	const choice = (key: string, selected: boolean, select: () => void, title: string, detail: string, path = true) => (
		<label
			key={key}
			className={cn(
				"flex cursor-pointer items-start gap-[12px] rounded-[7px] border px-[13px] py-[11px]",
				selected ? "border-muted bg-control" : "border-border-raised hover:bg-control",
			)}
		>
			<input
				type="radio"
				name="get-it-place"
				className="mt-[3px] accent-[var(--color-thread)]"
				checked={selected}
				onChange={select}
			/>
			<span className="flex min-w-0 flex-col gap-[3px]">
				<span className="type-control">{title}</span>
				<span className={cn("truncate text-muted", path ? "type-detail" : "type-label")} title={detail}>
					{detail}
				</span>
			</span>
		</label>
	);
	return (
		<ConfirmDialog
			title={`Get ${project.name}`}
			description={`Put ${team.name}’s ${project.name} on this Mac. Its design/ stays in step with the team and out of git.`}
			confirmLabel="Get it"
			disabled={place.kind === "pick" && picked === null}
			onConfirm={async () => {
				const where =
					place.kind === "mac"
						? ({ where: "mac" } as const)
						: ({ where: "checkout", path: place.kind === "pick" ? (picked ?? "") : place.path } as const);
				onGot(await getTeamProjectAt(team.address, project.name, where));
			}}
			onClose={onClose}
		>
			<div className="mb-[16px] flex flex-col gap-[8px]" role="radiogroup" aria-label="Where it goes">
				{project.checkouts.map((path) =>
					choice(
						path,
						place.kind === "checkout" && place.path === path,
						() => setPlace({ kind: "checkout", path }),
						`In ${tilde(path)}`,
						`Your checkout of ${project.repo}`,
						false,
					),
				)}
				{choice(
					"pick",
					place.kind === "pick",
					() => setPicking(true),
					"In a checkout…",
					picked === null ? "Choose a clone of the repo" : tilde(picked),
					picked !== null,
				)}
				{choice(
					"mac",
					place.kind === "mac",
					() => setPlace({ kind: "mac" }),
					"Just on this Mac",
					tilde(project.home),
				)}
			</div>
			{project.clone !== null && (
				<div className="mb-[8px] flex flex-col gap-[6px]">
					<span className="text-muted type-label">
						Not cloned yet? Clone {project.repo} yourself, then Get it there:
					</span>
					<code className="select-all overflow-x-auto rounded-[6px] border border-border-raised bg-bg px-[10px] py-[8px] type-detail">
						{project.clone}
					</code>
				</div>
			)}
		</ConfirmDialog>
	);
}

/**
 * "Move to team…": the project goes up whole, then one commit on the current branch takes design/ out of git. The
 * sheet says where the history before the move stays.
 */
export function MoveToTeamDialog({
	project,
	teams,
	onMoved,
	onClose,
}: {
	project: { root: string; name: string };
	/** The teams this account edits in. */
	teams: readonly CloudTeam[];
	onMoved: (moved: MoveOutcome, team: CloudTeam) => void;
	onClose: () => void;
}) {
	const [address, setAddress] = useState(teams[0]?.address ?? "");
	const chosen = teams.find((team) => team.address === address);
	return (
		<ConfirmDialog
			title={`Move ${project.name} to a team`}
			description={`spool uploads the whole project to ${chosen?.name ?? "the team"}, then makes one commit on your current branch that takes design/ out of git and adds spool.json. Nothing is pushed.`}
			confirmLabel={chosen === undefined ? "Move" : `Move to ${chosen.name}`}
			disabled={chosen === undefined}
			onConfirm={async () => {
				if (chosen === undefined) return;
				onMoved(await moveProjectToTeam(chosen.address, project.root), chosen);
			}}
			onClose={onClose}
		>
			{teams.length > 1 && (
				<label className="mb-[14px] flex flex-col gap-[8px] type-control">
					Team
					<select
						value={address}
						onChange={(event) => setAddress(event.target.value)}
						className="h-[38px] rounded-[7px] border border-border-raised bg-bg px-[11px] text-text outline-none focus:border-muted"
					>
						{teams.map((team) => (
							<option key={team.address} value={team.address}>
								{team.name}
							</option>
						))}
					</select>
				</label>
			)}
			<p className="mb-[8px] text-muted type-label">History before the move stays in git.</p>
		</ConfirmDialog>
	);
}
