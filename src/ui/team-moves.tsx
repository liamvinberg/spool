import { useEffect, useRef, useState } from "react";
import {
	type CloudTeam,
	fetchMoveProgress,
	fetchMoveStays,
	fetchTeamProjects,
	getTeamProjectAt,
	type HerePerson,
	type MoveOutcome,
	type MoveProgress,
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
	const [stays, setStays] = useState<{ path: string; why: string }[]>([]);
	useEffect(() => {
		let current = true;
		void fetchMoveStays(project.root).then((found) => {
			if (current) setStays(found);
		});
		return () => {
			current = false;
		};
	}, [project.root]);
	const [moving, setMoving] = useState(false);
	const move = useMoveUnderWay(project.root, moving, teams, (outcome, team) => {
		onMoved(outcome, team);
		onClose();
	});
	const chosen = teams.find((team) => team.address === address);
	return (
		<ConfirmDialog
			title={`Move ${project.name} to a team`}
			description={`spool uploads the whole project to ${chosen?.name ?? "the team"}, then makes one commit on your current branch that takes design/ out of git and adds spool.json. Nothing is pushed.`}
			confirmLabel={chosen === undefined ? "Move" : `Move to ${chosen.name}`}
			disabled={chosen === undefined || move.found !== null}
			onConfirm={async () => {
				if (chosen === undefined) return;
				setMoving(true);
				try {
					onMoved(await moveProjectToTeam(chosen.address, project.root), chosen);
				} finally {
					setMoving(false);
				}
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
			{stays.length > 0 && (
				<div className="mb-[8px] flex flex-col gap-[4px]" data-move-stays="">
					<p className="text-muted type-label">
						{stays.length === 1
							? "This file stays on this Mac and in git. It doesn't go to the team:"
							: `These ${stays.length} files stay on this Mac and in git. They don't go to the team:`}
					</p>
					<ul className="flex max-h-[120px] flex-col gap-[2px] overflow-auto">
						{stays.map(({ path, why }) => (
							<li key={path} className="text-muted type-detail">
								<span className="font-mono text-text">design/{path}</span> {why}
							</li>
						))}
					</ul>
				</div>
			)}
			{(moving || move.found !== null) && (
				<MoveProgressLine progress={move.progress} team={moving ? undefined : (move.found ?? undefined)} />
			)}
			{move.stopped !== null && (
				<p className="mb-[8px] text-thread-strong type-label" role="alert">
					{move.stopped}
				</p>
			)}
		</ConfirmDialog>
	);
}

/** How often the move sheet asks how far the move has got. */
const MOVE_PROGRESS_MS = 1_000;

/**
 * A project's move as the sheet follows it: asked once as the sheet opens, which finds a move already under way
 * (after a reload, or from a sheet closed earlier), then each second while one is, never over a question still out.
 * A move the sheet found that ends hands its outcome on, or says what stopped it; the sheet's own move is answered
 * by its request.
 */
function useMoveUnderWay(
	root: string,
	posting: boolean,
	teams: readonly CloudTeam[],
	onMoved: (moved: MoveOutcome, team: CloudTeam) => void,
) {
	/** The team, by name, of a move found under way that this sheet didn't start. */
	const [found, setFound] = useState<string | null>(null);
	const [progress, setProgress] = useState<MoveProgress | null>(null);
	const [stopped, setStopped] = useState<string | null>(null);
	const [opened, setOpened] = useState(false);
	/** A question still out: never asked over, so an older answer can't land after a newer one. */
	const asking = useRef(false);
	const latest = useRef({ teams, onMoved });
	latest.current = { teams, onMoved };
	const following = !opened || posting || found !== null;
	useEffect(() => {
		if (!following) return;
		let current = true;
		const ask = () => {
			if (asking.current) return;
			asking.current = true;
			void fetchMoveProgress(root).then((read) => {
				asking.current = false;
				if (!current) return;
				setOpened(true);
				if (read === undefined) return;
				setProgress(read.progress);
				const team = latest.current.teams.find((one) => one.address === read.team) ?? null;
				if (read.progress !== null) {
					if (!posting) {
						setFound(team?.name ?? read.team ?? "the team");
						setStopped(null);
					}
					return;
				}
				// the move ended: what no sheet heard is told here, and the sheet's own move its request answers
				if (posting) return;
				setFound(null);
				if (read.ended !== null && "error" in read.ended) setStopped(read.ended.error);
				else if (read.ended !== null && team !== null) latest.current.onMoved(read.ended.outcome, team);
			});
		};
		if (!opened) ask();
		const timer = setInterval(ask, MOVE_PROGRESS_MS);
		return () => {
			current = false;
			clearInterval(timer);
		};
	}, [root, following, posting, opened]);
	return { found, progress, stopped };
}

/**
 * Files up of all that go, and while spool.page isn't taking saves, why and for how long, counted down each second
 * here between the daemon's answers. A move this sheet found under way names its team first.
 */
function MoveProgressLine({ progress, team }: { progress: MoveProgress | null; team: string | undefined }) {
	const [, tick] = useState(0);
	const until = progress?.paused?.until;
	useEffect(() => {
		if (until === undefined) return;
		const timer = setInterval(() => tick((n) => n + 1), 1_000);
		return () => clearInterval(timer);
	}, [until]);
	if (progress === null || progress.total === 0)
		return team === undefined ? null : (
			<div className="mb-[8px]" role="status" data-move-progress="">
				<p className="type-label">Moving to {team}.</p>
			</div>
		);
	const seconds = until === undefined ? 0 : Math.max(1, Math.ceil((until - Date.now()) / 1_000));
	return (
		<div className="mb-[8px] flex flex-col gap-[4px]" role="status" data-move-progress="">
			{team !== undefined && <p className="type-label">Moving to {team}.</p>}
			<p className="type-label">
				{progress.up.toLocaleString("en")} of {progress.total.toLocaleString("en")} files up
			</p>
			{progress.paused !== null && (
				<p className="text-muted type-label">
					Paused: {progress.paused.why}. Carrying on in {seconds} {seconds === 1 ? "second" : "seconds"}.
				</p>
			)}
		</div>
	);
}

/** What became of a move's commit, when it wasn't made: said on Home until dismissed. */
export function moveCommitNote(outcome: MoveOutcome, team: CloudTeam): string | undefined {
	const moved = `${outcome.name} moved to ${team.name}.`;
	switch (outcome.commit) {
		case "waiting":
			return `${moved} Its commit lands once git is done with what it's doing.`;
		case "detached":
			return `${moved} HEAD is detached, so its commit wasn't made. Check out a branch and spool makes it the next time it starts.`;
		case "failed":
			return `${moved} git didn't take its commit. spool tries again the next time it starts, or commit spool.json and design/'s removal yourself.`;
		default:
			return undefined;
	}
}

export function MoveCommitLine({ note, onDismiss }: { note: string; onDismiss: () => void }) {
	return (
		<div
			role="status"
			className="pj-move-commit mb-[22px] flex min-h-[48px] items-center gap-[12px] border-border border-y py-[8px]"
		>
			<span className="min-w-0 flex-1 type-control">{note}</span>
			<button type="button" className={cn("home-action", HOME_ACTION)} onClick={onDismiss}>
				Dismiss
			</button>
		</div>
	);
}
