import { basename, resolve } from "node:path";
import { SpoolError } from "./errors";
import { moveSentence } from "./team-moves";
import type { ProjectLink } from "./team-project";

/**
 * `spool move` (task 136): a team project to another team, out of its team, or into a checkout, and a project on this
 * Mac only into a team (DEV-233), through the daemon's move routes as the app's sheets go. It says what the move does first (who loses the project, the commits it makes,
 * the folder it moves) and asks; `--yes` is the person's yes said ahead, and with no terminal to ask at nothing moves
 * without it.
 */
export interface MoveVerbOptions {
	/** `<team>/<project>`: one not on this Mac, moved to another team. */
	project?: string | undefined;
	/** The team it goes to, by address. */
	team?: string | undefined;
	/** Its name there, when the one it has is taken. */
	name?: string | undefined;
	out?: boolean | undefined;
	/** The checkout a copy in no repo moves into. */
	into?: string | undefined;
	yes?: boolean | undefined;
}

export interface MoveVerbDeps {
	/**
	 * The project the verb was run in: what moves when no `<team>/<project>` is named. Its link when it is a local copy
	 * of a team project; none when it is on this Mac only, and `--team` moves it in.
	 */
	here: () => Promise<{ root: string; link?: ProjectLink | undefined }>;
	/** A request to the daemon's `/api/cloud` routes. */
	request: (path: string, init?: { method: string; body?: unknown }) => Promise<Response>;
	/** Asks at a terminal; absent when there is none. */
	confirm?: ((question: string) => Promise<boolean>) | undefined;
	/** What the verb says. */
	print: (line: string) => void;
	/** Where the verb runs, which a relative `--into` is read from. */
	cwd: string;
}

export async function runMove(options: MoveVerbOptions, deps: MoveVerbDeps): Promise<void> {
	const ways = [options.team !== undefined, options.out === true, options.into !== undefined].filter(Boolean);
	if (ways.length === 0)
		throw new SpoolError(
			`say where it goes: one of \`--team <address>\`, \`--out\` and \`--into <checkout>\`. ${await yourTeams(deps)}`,
		);
	if (ways.length !== 1)
		throw new SpoolError("say where it goes: one of `--team <address>`, `--out` and `--into <checkout>`");
	if (options.name !== undefined && options.team === undefined) throw new SpoolError("`--name` goes with `--team`");
	const named = options.project === undefined ? undefined : parseNamed(options.project);
	if (named !== undefined && options.into !== undefined)
		throw new SpoolError("`--into` moves the project you're in: run it there, without naming one");
	const here = named === undefined ? await deps.here() : undefined;
	if (here !== undefined && here.link === undefined) {
		if (options.team === undefined)
			throw new SpoolError(
				`${here.root} isn't a team project: \`--team <address>\` moves it into one. ${await yourTeams(deps)}`,
			);
		return moveIn(here.root, options.team, options, deps);
	}
	const from = named ?? { team: here?.link?.team ?? "", project: here?.link?.project ?? "" };
	const at = `/teams/${encodeURIComponent(from.team)}/projects/${encodeURIComponent(from.project)}`;

	if (options.team !== undefined) {
		const to = options.team.trim().toLowerCase();
		const query = new URLSearchParams({ to, ...(options.name === undefined ? {} : { name: options.name }) });
		const preview = (await answer(deps.request(`${at}/move?${query}`))) as {
			losing: { name: string; email: string }[];
			refusal: string | null;
			commits: string[];
			folder: { from: string; to: string } | null;
		};
		const as = options.name ?? from.project;
		if (preview.refusal === "target_not_found")
			throw new SpoolError(`${moveSentence(preview.refusal, { ...from, to, name: as })} ${await yourTeams(deps)}`);
		if (preview.refusal !== null) throw new SpoolError(moveSentence(preview.refusal, { ...from, to, name: as }));
		deps.print(
			`moves ${from.team}/${from.project} to ${to}${as === from.project ? "" : ` as ${as}`}: the same project, its history and shares kept; ${from.team}/${from.project} leads on to it`,
		);
		if (preview.losing.length > 0)
			deps.print(
				`${listed(preview.losing.map((person) => person.name))} ${preview.losing.length === 1 ? "isn't" : "aren't"} in ${to}: their copies stop syncing and stay on their Macs as local projects`,
			);
		for (const root of preview.commits)
			deps.print(`spool.json changes in ${root}, in one commit on its current branch; nothing is pushed`);
		if (preview.folder !== null) deps.print(`${preview.folder.from} moves to ${preview.folder.to}`);
		await asked(options, deps);
		const moved = (await answer(
			deps.request(`${at}/move`, {
				method: "POST",
				body: { to, ...(options.name === undefined ? {} : { name: options.name }) },
			}),
		)) as { url: string; committed: string[]; commitWaiting: string[] };
		deps.print(`moved ${from.team}/${from.project} to ${moved.url}`);
		for (const root of moved.committed) deps.print(`committed spool.json in ${root}`);
		for (const root of moved.commitWaiting)
			deps.print(`the spool.json commit in ${root} waits for git; spool makes it once git is free`);
		return;
	}

	if (options.out === true) {
		deps.print(
			`moves ${from.team}/${from.project} out of ${from.team}: the team no longer has it, and everyone else's copy stops syncing`,
		);
		if (here !== undefined)
			deps.print(
				`${here.root} becomes a project on this Mac only: one commit on its current branch puts design/ back in git and takes spool.json out; nothing is pushed`,
			);
		await asked(options, deps);
		const out = (await answer(
			deps.request(`${at}/out`, { method: "POST", body: here === undefined ? {} : { path: here.root } }),
		)) as { root: string | null; committed: boolean; commitWaiting: boolean };
		deps.print(`moved ${from.project} out of ${from.team}`);
		if (out.root !== null && out.committed) deps.print(`committed design/ in ${out.root}`);
		if (out.root !== null && out.commitWaiting)
			deps.print(`the commit in ${out.root} waits for git; spool makes it once git is free`);
		return;
	}

	const checkout = resolve(deps.cwd, options.into ?? "");
	deps.print(
		`moves ${here?.root}'s design/ into ${checkout}: one commit on its current branch adds spool.json and the AGENTS.md line; nothing is pushed`,
	);
	deps.print(`${here?.root} goes to the Trash once its design/ is in the checkout`);
	await asked(options, deps);
	const into = (await answer(
		deps.request(`${at}/into`, { method: "POST", body: { path: here?.root, checkout } }),
	)) as { root: string; committed: boolean; commitWaiting: boolean };
	deps.print(`moved ${from.project} into ${into.root}`);
	if (into.committed) deps.print(`committed spool.json in ${into.root}`);
	if (into.commitWaiting) deps.print(`the commit in ${into.root} waits for git; spool makes it once git is free`);
}

/**
 * A project on this Mac only into a team (DEV-233), as the app's "Move to team…" does: the whole of design/ goes up,
 * then one commit on the current branch takes design/ out of git and brings spool.json and the AGENTS.md line in.
 * It takes its folder's name there.
 */
async function moveIn(root: string, wanted: string, options: MoveVerbOptions, deps: MoveVerbDeps): Promise<void> {
	const name = basename(root);
	if (options.name !== undefined)
		throw new SpoolError(
			`a project moving into a team takes its folder's name, ${name}: \`--name\` doesn't go with it`,
		);
	const teams = await teamsOf(deps);
	if (teams.state !== "ready") throw new SpoolError(teamsUnknown(teams.state));
	const key = wanted.trim().toLowerCase();
	const team = teams.teams.find((each) => each.address === key || each.name.toLowerCase() === key);
	if (team === undefined) throw new SpoolError(`You're not in a team at ${wanted}. ${teamsSaid(teams.teams)}`);
	if (team.role === "viewer")
		throw new SpoolError(`You're a viewer of ${team.name}. Only its editors and admins can move a project into it.`);
	const query = new URLSearchParams({ path: root });
	const stays = await deps
		.request(`/move/stays?${query}`)
		.then(async (got) => (got.ok ? ((await got.json()) as { stays?: { path: string; why: string }[] }).stays : []))
		.catch(() => []);
	const branches = await deps
		.request(`/move/branches?${query}`)
		.then(async (got) => (got.ok ? ((await got.json()) as { branches?: string[] }).branches : []))
		.catch(() => []);
	deps.print(
		`moves ${root} into ${team.name} as ${team.address}/${name}: spool uploads the whole project, then makes one commit on its current branch that takes design/ out of git and adds spool.json and the AGENTS.md line; nothing is pushed, and everyone who pulls gets the change`,
	);
	deps.print("history before the move stays in git");
	for (const stay of stays ?? [])
		deps.print(`design/${stay.path} stays on this Mac and in git, not in the team: ${stay.why}`);
	for (const branch of branches ?? [])
		deps.print(`${branch} still changes design/: merge it first, or it conflicts after the move`);
	await asked(options, deps);
	const moved = (await answer(
		deps.request(`/teams/${encodeURIComponent(team.address)}/move`, { method: "POST", body: { path: root } }),
	)) as { root: string; name: string; commit: string };
	deps.print(`moved ${moved.root} to ${teams.origin}/${team.address}/${moved.name}`);
	deps.print(movedInCommit(moved.root, moved.commit));
}

/** What became of a move in's commit, said as the app says it. */
function movedInCommit(root: string, commit: string): string {
	switch (commit) {
		case "committed":
			return `committed the move in ${root}`;
		case "no-git":
			return `${root} is in no repo, so nothing was committed`;
		case "waiting":
			return `the move commit in ${root} waits for git; spool makes it once git is free`;
		case "detached":
			return `HEAD is detached in ${root}, so the move commit wasn't made; check out a branch and spool makes it the next time it starts`;
		default:
			return `git didn't take the move commit in ${root}; spool tries again the next time it starts`;
	}
}

type TeamsRead =
	| { state: "ready"; teams: { address: string; name: string; role: string }[]; origin: string }
	| { state: "signed-out" | "unreachable" };

/** The account's teams, as the daemon reads them from spool.page. */
async function teamsOf(deps: MoveVerbDeps): Promise<TeamsRead> {
	try {
		const got = await deps.request("/teams");
		const body = (await got.json()) as Partial<TeamsRead>;
		if (body.state === "ready" || body.state === "signed-out") return body as TeamsRead;
	} catch {
		// said below as spool.page not answering
	}
	return { state: "unreachable" };
}

/** The account's teams in a sentence, for an error that needs a team named: an agent picks one from it. */
async function yourTeams(deps: MoveVerbDeps): Promise<string> {
	const teams = await teamsOf(deps);
	return teams.state === "ready" ? teamsSaid(teams.teams) : teamsUnknown(teams.state);
}

function teamsSaid(teams: readonly { address: string; name: string; role: string }[]): string {
	if (teams.length === 0) return "You're in no team.";
	return `Your teams: ${teams.map((team) => `${team.address} (${team.name}${team.role === "viewer" ? ", viewer" : ""})`).join(", ")}.`;
}

function teamsUnknown(state: "signed-out" | "unreachable"): string {
	return state === "signed-out"
		? "This machine isn't signed in to spool.page: `spool login` first."
		: "spool.page couldn't say which teams you're in just now; try again.";
}

/** The person says yes, at a terminal or ahead with `--yes`; anything else moves nothing. */
async function asked(options: MoveVerbOptions, deps: MoveVerbDeps): Promise<void> {
	if (options.yes === true) return;
	if (deps.confirm === undefined)
		throw new SpoolError(
			"nothing moved: spool move asks first. Ask the person, and run it again with --yes once they said yes",
		);
	if (!(await deps.confirm("Move?"))) throw new SpoolError("nothing moved");
}

/** A daemon answer, or what it refused with. */
async function answer(response: Promise<Response>): Promise<unknown> {
	const got = await response;
	const body = (await got.json().catch(() => ({}))) as { error?: unknown };
	if (!got.ok) throw new SpoolError(typeof body.error === "string" ? body.error : `the daemon answered ${got.status}`);
	return body;
}

function parseNamed(value: string): { team: string; project: string } {
	const [team, project, ...rest] = value.split("/");
	if (team === undefined || team === "" || project === undefined || project === "" || rest.length > 0)
		throw new SpoolError(`name a team project as <team>/<project>, got "${value}"`);
	return { team, project };
}

/** "Jonas", "Jonas and Mira", "Jonas, Mira and Sam". */
function listed(names: readonly string[]): string {
	return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
