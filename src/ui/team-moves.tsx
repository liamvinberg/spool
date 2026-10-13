import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { personName, saidList } from "../share-view";
import {
	type BranchesTouchingDesign,
	type CloudTeam,
	fetchMoveBranches,
	fetchMoveProgress,
	fetchMoveStays,
	fetchTeamProjects,
	getTeamProjectAt,
	type HerePerson,
	type MoveOutcome,
	type MoveProgress,
	moveProjectInto,
	moveProjectOut,
	moveProjectToTeam,
	type ProjectCard,
	TeamActionRefused,
	type TeamProjectOnMac,
} from "./api";
import { cn } from "./cn";
import { ConfirmDialog, RefusedInPlace } from "./confirm-dialog";
import { HerePill, MenuBackdrop, type MoveItem, type MoveItems } from "./home";
import { DotsIcon } from "./icons";
import { tilde } from "./paths";
import { ProjectPicker } from "./picker";
import { Button, IconButton } from "./primitives/actions";
import { Field, TextField } from "./primitives/inputs";
import { Menu, MenuItem } from "./primitives/overlays";
import { RadioCard, RadioGroup } from "./primitives/selection";
import { systemTrashName } from "./system-trash";
import {
	folderName,
	type MoveDone,
	MoveTeamSheet,
	mayMoveFrom,
	moveTargets,
	Paths,
	Says,
	teamMoveDone,
	waitingNote,
} from "./team-move";
import { teamSays } from "./team-source";
import { TeamsSourceContext } from "./teams";

/**
 * Getting a team project onto this Mac, and moving a project into a team (DEV-190). The daemon does the work; these
 * are the dimmed covers of what the team has that this Mac doesn't, the "Get it" sheet, and the "Move to team…" one,
 * and for a team project, the sheets that move it out of its team or into a checkout.
 */

/**
 * The team's projects not yet on this Mac, dimmed, each with "Get it", and for the team's admins a "…" menu that
 * moves one to another team. Read once when it mounts: Home mounts it again whenever this Mac's
 * own projects change, so a project just got leaves the list, as one moved away does. Nothing shows while spool.page
 * can't say.
 */
export function TeamProjectsAway({
	team,
	teams = [],
	here,
	onGot,
	onMoved,
}: {
	team: CloudTeam;
	/** Every team of this account's, for where a project can move and who may move it. */
	teams?: readonly CloudTeam[];
	/** Who is inside each of the team's projects now, by name: someone may be in one this Mac doesn't hold. */
	here?: ReadonlyMap<string, readonly HerePerson[]>;
	onGot: (project: { root: string; name: string }) => void;
	/** A project moved to another team or out of this one, from its "…" menu. */
	onMoved?: (done: MoveDone) => void;
}) {
	const [projects, setProjects] = useState<TeamProjectOnMac[] | undefined>();
	const [getting, setGetting] = useState<TeamProjectOnMac | null>(null);
	const [menu, setMenu] = useState<string | null>(null);
	const [moving, setMoving] = useState<TeamProjectOnMac | null>(null);
	useEffect(() => {
		let current = true;
		void fetchTeamProjects(team.address).then((listed) => {
			if (current) setProjects(listed);
		});
		return () => {
			current = false;
		};
	}, [team.address]);
	// moving one out is only offered on a copy: its commit is what brings design/ back into git
	const moves = (project: TeamProjectOnMac): MoveItem[] =>
		mayMoveFrom(teams, team.address) ? [{ label: "Move to team…", onClick: () => setMoving(project) }] : [];
	/** A project moved to another team leaves this team's list. */
	const moved = (project: TeamProjectOnMac, done: MoveDone) => {
		setProjects((listed) => listed?.filter((each) => each.url !== project.url));
		onMoved?.(done);
	};
	const away = (projects ?? []).filter((project) => project.copies.length === 0);
	if (away.length === 0) return null;
	return (
		<section className="pj-away mt-[44px]" aria-label="Not on this Mac">
			<h2 className="mb-[18px] text-secondary type-caption">Not on this Mac</h2>
			<div className="pj-covers-grid grid grid-cols-3 gap-x-[24px] gap-y-[34px] [@media(max-width:1050px)]:grid-cols-2 [@media(max-width:720px)]:grid-cols-1">
				{away.map((project) => (
					<article key={project.url} className="pj-away-cover group/project relative min-w-0">
						<div className="relative">
							<div className="grid aspect-[1.82] place-items-center rounded-[8px] border border-dashed border-line-strong bg-surface-canvas opacity-60">
								<span className="px-[18px] text-center text-secondary type-detail">
									{project.repo ?? "no repo linked"}
								</span>
							</div>
							<HerePill people={here?.get(project.name)} />
						</div>
						<div className="flex items-center justify-between gap-[9px] pt-[15px]">
							<strong className="truncate text-secondary type-title font-[500]">{project.name}</strong>
							<span className="flex items-center gap-[4px]">
								<Button aria-label={`Get ${project.name}`} onClick={() => setGetting(project)}>
									Get it
								</Button>
								{moves(project).length > 0 && (
									<IconButton
										icon={<DotsIcon />}
										label={`Manage ${project.name}`}
										pressed={menu === project.url}
										aria-haspopup="menu"
										aria-expanded={menu === project.url}
										className={cn(
											menu === project.url
												? "opacity-100"
												: "opacity-0 focus-visible:opacity-100 group-focus-within/project:opacity-100 group-hover/project:opacity-100",
										)}
										onClick={() => setMenu(menu === project.url ? null : project.url)}
									/>
								)}
							</span>
						</div>
						{menu === project.url && (
							<Menu className="absolute top-full right-0 z-20 origin-top-right">
								{moves(project).map((move) => (
									<MenuItem
										key={move.label}
										label={move.label}
										destructive={move.end}
										onClick={() => {
											setMenu(null);
											move.onClick();
										}}
									/>
								))}
							</Menu>
						)}
					</article>
				))}
			</div>
			{menu !== null && <MenuBackdrop onClose={() => setMenu(null)} />}
			{moving !== null && (
				<MoveTeamSheet
					from={team}
					project={moving}
					targets={moveTargets(teams, team.address)}
					onMoved={(outcome, to) => moved(moving, teamMoveDone(moving.name, outcome, to))}
					onClose={() => setMoving(null)}
				/>
			)}
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
		<RadioCard
			key={key}
			name="get-it-place"
			value={key}
			checked={selected}
			onSelect={select}
			label={title}
			description={
				<span className={cn("block truncate", path && "type-detail")} title={detail}>
					{detail}
				</span>
			}
		/>
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
			<RadioGroup label="Where it goes">
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
			</RadioGroup>
			{project.clone !== null && (
				<div className="mb-[8px] flex flex-col gap-[6px]">
					<span className="text-secondary type-label">
						Not cloned yet? Clone {project.repo} yourself, then Get it there:
					</span>
					<code className="select-all overflow-x-auto rounded-[6px] border border-line-strong bg-surface-window px-[10px] py-[8px] type-detail">
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
						className="h-[38px] rounded-[7px] border border-line-strong bg-surface-window px-[11px] text-primary outline-none focus:border-secondary"
					>
						{teams.map((team) => (
							<option key={team.address} value={team.address}>
								{team.name}
							</option>
						))}
					</select>
				</label>
			)}
			<p className="mb-[8px] text-secondary type-label">History before the move stays in git.</p>
			{stays.length > 0 && (
				<div className="mb-[8px] flex flex-col gap-[4px]" data-move-stays="">
					<p className="text-secondary type-label">
						{stays.length === 1
							? "This file stays on this Mac and in git. It doesn't go to the team:"
							: `These ${stays.length} files stay on this Mac and in git. They don't go to the team:`}
					</p>
					<ul className="flex max-h-[120px] flex-col gap-[2px] overflow-auto">
						{stays.map(({ path, why }) => (
							<li key={path} className="text-secondary type-detail">
								<span className="font-mono text-primary">design/{path}</span> {why}
							</li>
						))}
					</ul>
				</div>
			)}
			<MoveBranches root={project.root} />
			{(moving || move.found !== null) && (
				<MoveProgressLine progress={move.progress} team={moving ? undefined : (move.found ?? undefined)} />
			)}
			{move.stopped !== null && (
				<p className="mb-[8px] text-accent-strong type-label" role="alert">
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
				<p className="text-secondary type-label">
					Waiting: {progress.paused.why}. Carrying on in {seconds} {seconds === 1 ? "second" : "seconds"}.
				</p>
			)}
		</div>
	);
}

/**
 * The branches that still change design/ (DEV-236): once the move commit takes design/ out of git, merging one is a
 * modify/delete conflict. A warning, not a block; nothing shows when there are none or git can't say, and a line
 * says so when only the most recent branches were checked. Closing the sheet stops the check.
 */
function MoveBranches({ root }: { root: string }) {
	const [found, setFound] = useState<BranchesTouchingDesign>({ branches: [], checkedOnly: null });
	useEffect(() => {
		const asking = new AbortController();
		void fetchMoveBranches(root, asking.signal).then((answer) => {
			if (!asking.signal.aborted) setFound(answer);
		});
		return () => asking.abort();
	}, [root]);
	const { branches, checkedOnly } = found;
	if (branches.length === 0 && checkedOnly === null) return null;
	return (
		<div className="mb-[8px] flex flex-col gap-[4px]" data-move-branches="">
			{branches.length > 0 && (
				<>
					<p className="text-secondary type-label">
						{branches.length === 1
							? "This branch still changes design/. Merge it first, or it'll conflict after the move:"
							: `These ${branches.length} branches still change design/. Merge them first, or they'll conflict after the move:`}
					</p>
					<ul className="flex max-h-[120px] flex-col gap-[2px] overflow-auto">
						{branches.map((branch) => (
							<li key={branch} className="font-mono text-primary type-detail">
								{branch}
							</li>
						))}
					</ul>
				</>
			)}
			{checkedOnly !== null && <p className="text-secondary type-label">{partlyChecked(checkedOnly)}</p>}
		</div>
	);
}

/** Said when the branch check stopped short, at its limit or its time. */
function partlyChecked(checked: number): string {
	if (checked === 0) return "spool ran out of time before it could check the branches.";
	if (checked === 1) return "Only the most recent branch was checked.";
	return `Only the ${checked} most recent branches were checked.`;
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
			className="pj-move-commit mb-[22px] flex min-h-[48px] items-center gap-[12px] border-line-default border-y py-[8px]"
		>
			<span className="min-w-0 flex-1 type-control">{note}</span>
			<Button onClick={onDismiss}>Dismiss</Button>
		</div>
	);
}

/**
 * "Move out of <team>…", an admin's: the inverse of the move in. Once this Mac's copy is caught up, the team no longer
 * has the project and one commit puts design/ back in git; every other copy ends. With no copy here, or one in no
 * repo, nothing is committed.
 */
export function MoveOutSheet({
	team,
	project,
	path,
	inRepo = true,
	onMoved,
	onClose,
}: {
	team: CloudTeam;
	/** The project as its team names it. */
	project: string;
	/** This Mac's copy, to commit in; none when the project isn't on this Mac. */
	path?: string | undefined;
	inRepo?: boolean;
	onMoved: (done: MoveDone) => void;
	onClose: () => void;
}) {
	const source = useContext(TeamsSourceContext);
	const [others, setOthers] = useState<string[]>([]);
	const [moving, setMoving] = useState(false);
	const progress = useProgressWhile(path, moving);
	useEffect(() => {
		let current = true;
		void source
			.people(team.address)
			.then((people) => {
				if (current)
					setOthers(
						people.members
							.filter((member) => !member.you && member.role !== "viewer")
							.map((member) => personName(member.email)),
					);
			})
			.catch(() => {});
		return () => {
			current = false;
		};
	}, [source, team.address]);
	const commits = path !== undefined && inRepo;
	return (
		<ConfirmDialog
			title={`Move ${project} out of ${team.name}`}
			description={
				path === undefined
					? `${team.name} no longer has ${project}. No copy of it is on this Mac, so nothing is committed here.`
					: `${project} becomes a project on this Mac only, and ${team.name} no longer has it. ${
							commits
								? "spool makes one commit on your current branch that puts design/ back in git and takes spool.json out. Nothing is pushed."
								: "It’s in no repo, so nothing is committed."
						}`
			}
			confirmLabel={`Move out of ${team.name}`}
			danger
			onConfirm={async () => {
				setMoving(true);
				try {
					const out = await moveProjectOut(team.address, project, path);
					const done = `${project} is out of ${team.name}.`;
					const note = out.root !== null && out.commitWaiting ? waitingNote(done, [out.root]) : undefined;
					onMoved({
						toast:
							out.root !== null && out.committed
								? `${done} design/ is committed in ${folderName(out.root)}.`
								: done,
						...(note === undefined ? {} : { note }),
						...(out.root === null ? {} : { show: null }),
					});
				} catch (error) {
					throw new Error(said(error));
				} finally {
					setMoving(false);
				}
			}}
			onClose={onClose}
		>
			{others.length > 0 && (
				<Says>
					{saidList(others)} {others.length === 1 ? "edits" : "edit"} in {team.name}. Any copy they have stops
					syncing and becomes a local project too, and its design/ comes back into git when they pull.
				</Says>
			)}
			{moving && <MoveProgressLine progress={progress} team={undefined} />}
		</ConfirmDialog>
	);
}

/** How far this Mac's copy has got catching up with its team, asked each second while `on`. */
function useProgressWhile(path: string | undefined, on: boolean): MoveProgress | null {
	const [progress, setProgress] = useState<MoveProgress | null>(null);
	useEffect(() => {
		if (path === undefined || !on) return;
		let current = true;
		let asking = false;
		const ask = () => {
			if (asking) return;
			asking = true;
			void fetchMoveProgress(path).then((read) => {
				asking = false;
				if (current && read !== undefined) setProgress(read.progress);
			});
		};
		const timer = setInterval(ask, MOVE_PROGRESS_MS);
		return () => {
			current = false;
			clearInterval(timer);
		};
	}, [path, on]);
	return progress;
}

/** A refusal said to a person: the daemon's sentence, or Home's words for spool.page's reason. */
function said(error: unknown): string {
	if (error instanceof TeamActionRefused) return error.said ?? teamSays(error);
	return error instanceof Error ? error.message : "Could not finish. Try again.";
}

/** Refusals of a checkout, said under the Checkout field. */
const CHECKOUT_REFUSALS = new Set(["checkout_has_design", "checkout_is_a_project", "not_a_checkout", "in_a_repo"]);

/**
 * "Move into a checkout…" on a team project's local copy in no repo: its design/ moves into the clone picked, one
 * commit there adds spool.json and the AGENTS.md line, and the old folder goes to the Trash. The clone of the
 * project's repo on this Mac, when there is one, is offered first.
 */
export function IntoCheckoutSheet({
	team,
	project,
	root,
	onMoved,
	onClose,
}: {
	team: Pick<CloudTeam, "address" | "name">;
	/** The project as its team names it. */
	project: string;
	/** This Mac's copy, in no repo. */
	root: string;
	onMoved: (done: MoveDone) => void;
	onClose: () => void;
}) {
	const [listed, setListed] = useState<TeamProjectOnMac | undefined>();
	const [checkout, setCheckout] = useState<string | null>(null);
	const [picking, setPicking] = useState(false);
	const [refused, setRefused] = useState<{ checkout: string; said: string } | null>(null);
	useEffect(() => {
		let current = true;
		void fetchTeamProjects(team.address).then((projects) => {
			const found = projects?.find((each) => each.name === project);
			if (!current || found === undefined) return;
			setListed(found);
			setCheckout((chosen) => chosen ?? found.checkouts[0] ?? null);
		});
		return () => {
			current = false;
		};
	}, [team.address, project]);
	if (picking)
		return (
			<ProjectPicker
				initial="location"
				location="~"
				onOpened={() => {}}
				onClose={() => setPicking(false)}
				onLocation={async (path) => {
					setCheckout(path);
					setPicking(false);
					return { ok: true };
				}}
			/>
		);
	const refusal = refused !== null && refused.checkout === checkout ? refused.said : undefined;
	const clone = checkout !== null && listed?.repo != null && listed.checkouts.includes(checkout);
	return (
		<ConfirmDialog
			title={`Move ${project} into a checkout`}
			description={`Its design/ moves into the repo you choose and stays in step with ${team.name}. One commit on your current branch adds spool.json, and a line in AGENTS.md that points agents at the canvas. Nothing is pushed.`}
			confirmLabel="Move"
			disabled={checkout === null || refusal !== undefined}
			onConfirm={async () => {
				if (checkout === null) return;
				try {
					const into = await moveProjectInto(team.address, project, root, checkout);
					const done = `Moved ${project} into ${tilde(into.root)}.`;
					const note = into.commitWaiting
						? waitingNote(`${project} moved into ${tilde(into.root)}.`, [into.root])
						: undefined;
					onMoved({
						toast: into.committed ? `${done} spool.json is committed.` : done,
						...(note === undefined ? {} : { note }),
					});
				} catch (error) {
					if (error instanceof TeamActionRefused && CHECKOUT_REFUSALS.has(error.code)) {
						setRefused({ checkout, said: checkoutRefused(error, checkout, project) });
						throw new RefusedInPlace();
					}
					throw new Error(said(error));
				}
			}}
			onClose={onClose}
		>
			<Field label="Checkout" hint={clone ? `Your clone of ${listed?.repo}` : undefined} error={refusal}>
				{(id) => (
					<span className="flex items-center gap-[8px]">
						<TextField
							className="min-w-0 flex-1"
							size="lg"
							mono
							value={checkout === null ? "" : tilde(checkout)}
							placeholder="Choose a clone of the repo"
							error={refusal !== undefined}
							inputProps={{ id, readOnly: true }}
						/>
						<Button size="lg" onClick={() => setPicking(true)}>
							Choose…
						</Button>
					</span>
				)}
			</Field>
			<Says>
				<Paths paths={[root]} /> goes to the {systemTrashName()} once its design/ is in the checkout.
			</Says>
		</ConfirmDialog>
	);
}

/** Why the checkout picked can't take the project, in the sheet's words. */
function checkoutRefused(refused: TeamActionRefused, checkout: string, project: string): string {
	switch (refused.code) {
		case "checkout_has_design":
			return `${tilde(checkout)} already has a design/ folder. Choose another checkout.`;
		case "checkout_is_a_project":
			return `${tilde(checkout)} is already a spool project. Choose another checkout.`;
		case "not_a_checkout":
			return `${tilde(checkout)} isn’t a git checkout. Choose a clone of the repo.`;
		case "in_a_repo":
			return `${project} is already in a repo, so it can’t move into another.`;
		default:
			return said(refused);
	}
}

type CoverSheet = { kind: "team" | "out" | "into"; project: ProjectCard; link: NonNullable<ProjectCard["team"]> };

/**
 * The moves each of Home's covers offers, and the sheet one opened. A project in no team keeps today's "Move to
 * team…" while this account edits in a team. A team project's copy offers "Move to team…" to admins of its team with
 * another team to move it to, "Move into a checkout…" when it sits in no repo, and "Move out of <team>…" to its
 * admins, at the foot of the menu.
 */
export function useCoverMoves({
	teams,
	onMoveIn,
	onDone,
}: {
	/** Every team of this account's, with its role there. */
	teams: readonly CloudTeam[];
	/** Today's "Move to team…" sheet for a project in no team; none while this account edits in no team. */
	onMoveIn?: ((project: ProjectCard) => void) | undefined;
	onDone: (done: MoveDone) => void;
}): { moveItems: MoveItems; surface: ReactNode } {
	const [sheet, setSheet] = useState<CoverSheet | null>(null);
	const moveItems: MoveItems = (project) => {
		const link = project.team;
		if (link === undefined)
			return onMoveIn === undefined ? [] : [{ label: "Move to team…", onClick: () => onMoveIn(project) }];
		const own = teams.find((team) => team.address === link.team);
		const open = (kind: CoverSheet["kind"]) => () => setSheet({ kind, project, link });
		const items: MoveItem[] = [];
		if (mayMoveFrom(teams, link.team)) items.push({ label: "Move to team…", onClick: open("team") });
		if (link.inRepo === false) items.push({ label: "Move into a checkout…", onClick: open("into") });
		if (own?.role === "admin") items.push({ label: `Move out of ${own.name}…`, end: true, onClick: open("out") });
		return items;
	};
	const own = sheet === null ? undefined : teams.find((team) => team.address === sheet.link.team);
	const close = () => setSheet(null);
	const surface =
		sheet === null ? null : sheet.kind === "team" && own !== undefined ? (
			<MoveTeamSheet
				from={own}
				project={{ name: sheet.link.project, url: sheet.link.url }}
				targets={moveTargets(teams, own.address)}
				onMoved={(outcome, to) => onDone(teamMoveDone(sheet.link.project, outcome, to))}
				onClose={close}
			/>
		) : sheet.kind === "out" && own !== undefined ? (
			<MoveOutSheet
				team={own}
				project={sheet.link.project}
				path={sheet.project.root}
				inRepo={sheet.link.inRepo !== false}
				onMoved={onDone}
				onClose={close}
			/>
		) : sheet.kind === "into" ? (
			<IntoCheckoutSheet
				team={own ?? { address: sheet.link.team, name: sheet.link.team }}
				project={sheet.link.project}
				root={sheet.project.root}
				onMoved={onDone}
				onClose={close}
			/>
		) : null;
	return { moveItems, surface };
}
