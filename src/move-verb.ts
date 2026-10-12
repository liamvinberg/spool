import { resolve } from "node:path";
import { SpoolError } from "./errors";
import { moveSentence } from "./team-moves";
import type { ProjectLink } from "./team-project";

/**
 * `spool move` (task 136): a team project to another team, out of its team, or into a checkout, through the daemon's
 * move routes as the app's sheets go. It says what the move does first (who loses the project, the commits it makes,
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
	/** The project the verb was run in, when it is a local copy: what moves when no `<team>/<project>` is named. */
	here: () => Promise<{ root: string; link: ProjectLink }>;
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
	if (ways.length !== 1)
		throw new SpoolError("say where it goes: one of `--team <address>`, `--out` and `--into <checkout>`");
	if (options.name !== undefined && options.team === undefined) throw new SpoolError("`--name` goes with `--team`");
	const named = options.project === undefined ? undefined : parseNamed(options.project);
	if (named !== undefined && options.into !== undefined)
		throw new SpoolError("`--into` moves the project you're in: run it there, without naming one");
	const here = named === undefined ? await deps.here() : undefined;
	const from = named ?? { team: here?.link.team ?? "", project: here?.link.project ?? "" };
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
