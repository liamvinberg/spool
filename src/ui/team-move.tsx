import { Fragment, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CloudTeam } from "../cloud-teams";
import { saidList } from "../share-view";
import { ConfirmDialog, RefusedInPlace } from "./confirm-dialog";
import { tilde } from "./paths";
import { Toast } from "./primitives/feedback";
import { Field, TextField } from "./primitives/inputs";
import { type MovePreview, TeamActionRefused, type TeamMoveOutcome, teamSays } from "./team-source";
import { TeamsSourceContext } from "./teams";

/**
 * "Move to team…" on a team project: the same project changes team, keeping its id, history, shares and open
 * canvases, and its old address leads on. Drawn on a Mac and at spool.page/<team> alike: only the daemon's preview
 * says commits and a folder, since only a Mac has them.
 */

/** How long after a keystroke in Name the sheet waits before asking what the move would do. */
const PREVIEW_MS = 250;

/** A move's refusals the sheet says in place: beside Name, or under Team. */
const BY_NAME = new Set(["name_taken", "invalid_input"]);
const UNDER_TEAM = new Set(["admin_required", "same_team", "target_not_found", "target_editor_required", "unpaid"]);

/** The teams a project in `from` can move to: the asker's others where they're an editor or an admin. */
export function moveTargets(teams: readonly CloudTeam[], from: string): CloudTeam[] {
	return teams.filter((team) => team.address !== from && team.role !== "viewer");
}

/** Whether "Move to team…" is offered on a project in `from`: its admins, with somewhere to move it. */
export function mayMoveFrom(teams: readonly CloudTeam[], from: string): boolean {
	const own = teams.find((team) => team.address === from);
	return own?.role === "admin" && moveTargets(teams, from).length > 0;
}

export function MoveTeamSheet({
	from,
	project,
	targets,
	onMoved,
	onClose,
}: {
	/** The team it leaves. */
	from: CloudTeam;
	/** The project as its team names it, and its address there. */
	project: { name: string; url: string };
	/** The teams it can move to. */
	targets: readonly CloudTeam[];
	onMoved: (moved: TeamMoveOutcome, to: CloudTeam) => void;
	onClose: () => void;
}) {
	const source = useContext(TeamsSourceContext);
	const [address, setAddress] = useState(targets[0]?.address ?? "");
	const [name, setName] = useState(project.name);
	const [preview, setPreview] = useState<{ address: string; name: string; read: MovePreview } | null>(null);
	const [posted, setPosted] = useState<{ address: string; name: string; refused: TeamActionRefused } | null>(null);
	const asked = useRef(false);
	const to = targets.find((team) => team.address === address);
	const wanted = name.trim();
	useEffect(() => {
		if (address === "" || wanted === "") return;
		let current = true;
		const ask = () =>
			void source
				.movePreview(from.address, project.name, address, wanted === project.name ? undefined : wanted)
				.catch(() => undefined)
				.then((read) => {
					if (current && read !== undefined) setPreview({ address, name: wanted, read });
				});
		// asked at once as the sheet opens, then after typing settles
		const timer = setTimeout(ask, asked.current ? PREVIEW_MS : 0);
		asked.current = true;
		return () => {
			current = false;
			clearTimeout(timer);
		};
	}, [source, from.address, project.name, address, wanted]);
	const now = (said: { address: string; name: string } | null) => said?.address === address && said.name === wanted;
	const refused =
		posted !== null && now(posted)
			? posted.refused
			: preview !== null && now(preview) && preview.read.refusal !== null
				? new TeamActionRefused(preview.read.refusal)
				: null;
	const says = refused === null || to === undefined ? null : moveRefused(refused, from, to, wanted);
	// what the move does, as last read for this team: a keystroke in Name doesn't blank it
	const read = preview?.address === address ? preview.read : null;
	return (
		<ConfirmDialog
			title={`Move ${project.name} to another team`}
			description={`It keeps its history, its shares and everyone’s open canvases. ${shortUrl(project.url)} goes on working and leads to the new address.`}
			confirmLabel={to === undefined ? "Move" : `Move to ${to.name}`}
			disabled={to === undefined || wanted === "" || says !== null}
			onConfirm={async () => {
				if (to === undefined) return;
				try {
					onMoved(
						await source.move(
							from.address,
							project.name,
							to.address,
							wanted === project.name ? undefined : wanted,
						),
						to,
					);
				} catch (error) {
					if (error instanceof TeamActionRefused && (BY_NAME.has(error.code) || UNDER_TEAM.has(error.code))) {
						setPosted({ address, name: wanted, refused: error });
						throw new RefusedInPlace();
					}
					throw new Error(
						error instanceof TeamActionRefused ? teamSays(error, error.said) : "Could not finish. Try again.",
					);
				}
			}}
			onClose={onClose}
		>
			<Field label="Team" error={refused !== null && !BY_NAME.has(refused.code) ? says : undefined}>
				{(id) => (
					<select
						id={id}
						value={address}
						onChange={(event) => setAddress(event.target.value)}
						className="h-[38px] rounded-[7px] border border-line-strong bg-surface-window px-[11px] text-primary outline-none focus:border-secondary"
					>
						{targets.map((team) => (
							<option key={team.address} value={team.address}>
								{team.name}
							</option>
						))}
					</select>
				)}
			</Field>
			<Field label="Name" error={refused !== null && BY_NAME.has(refused.code) ? says : undefined}>
				{(id) => (
					<TextField
						inputProps={{ id }}
						size="lg"
						mono
						value={name}
						onValueChange={setName}
						error={refused !== null && BY_NAME.has(refused.code)}
					/>
				)}
			</Field>
			{read !== null && to !== undefined && (
				<div className="mt-[4px] flex flex-col gap-[6px]" data-move-says="">
					{read.losing.length > 0 && (
						<Says>
							{saidList(read.losing.map((person) => person.name))}{" "}
							{read.losing.length === 1 ? "isn’t" : "aren’t"} in {to.name}. Their copies stop syncing and stay on
							their Macs as local projects.
						</Says>
					)}
					{read.commits.length > 0 && (
						<Says>
							spool.json changes in <Paths paths={read.commits} />, in one commit on{" "}
							{read.commits.length === 1 ? "your current branch" : "the current branch of each"}. Nothing is
							pushed.
						</Says>
					)}
					{read.folder !== null && (
						<Says>
							<Paths paths={[read.folder.from]} /> moves to <Paths paths={[read.folder.to]} />.
						</Says>
					)}
				</div>
			)}
		</ConfirmDialog>
	);
}

/** Why the move can't happen, in the sheet's words. */
function moveRefused(refused: TeamActionRefused, from: CloudTeam, to: CloudTeam, name: string): string {
	switch (refused.code) {
		case "name_taken":
			return `${to.name} already has a project called ${name}. Pick another name.`;
		case "invalid_input":
			return "Use 2 to 40 lower-case letters, digits and hyphens.";
		case "unpaid":
			return `${to.name}’s trial has ended. It takes projects again once an admin pays for it.`;
		case "admin_required":
			return `Only admins of ${from.name} can move its projects to another team.`;
		case "same_team":
			return `It’s already in ${to.name}.`;
		case "target_not_found":
			return `You’re no longer in ${to.name}.`;
		case "target_editor_required":
			return `You’re a viewer in ${to.name}. Only its editors and admins can move projects in.`;
		default:
			return teamSays(refused, refused.said);
	}
}

/** A sentence of what the move does, quiet under the fields. */
export function Says({ children }: { children: ReactNode }) {
	return <p className="text-secondary type-label">{children}</p>;
}

/** Paths in a sentence, each as the machine says it, run together as a list is said. */
export function Paths({ paths }: { paths: readonly string[] }) {
	return (
		<>
			{paths.map((path, index) => (
				<Fragment key={path}>
					{index === 0 ? "" : index === paths.length - 1 ? " and " : ", "}
					<span className="font-mono text-primary">{tilde(path)}</span>
				</Fragment>
			))}
		</>
	);
}

/** A project's address as a person reads it: `spool.page/tidemark/site`. */
function shortUrl(url: string): string {
	return url.replace(/^https?:\/\//u, "");
}

/** The folder a root is, as its cover names it. */
export function folderName(root: string): string {
	return root.slice(root.lastIndexOf("/") + 1);
}

/**
 * What a finished move says on Home: a toast, a line kept until dismissed when a commit waits for git, and the page
 * to show after: a team's, by its address; Your projects, null; or where Home is, when absent.
 */
export interface MoveDone {
	toast: string;
	note?: string;
	show?: string | null;
}

/** "design/ is back in git in tidemark-app: one commit, nothing pushed.", or that its commit waits for git. */
export function backInGitDone(out: { root: string; committed: boolean }): MoveDone {
	const where = `design/ is back in git in ${folderName(out.root)}`;
	if (out.committed) return { toast: `${where}: one commit, nothing pushed.` };
	const note = waitingNote(`${where}.`, [out.root]);
	return { toast: `${where}.`, ...(note === undefined ? {} : { note }) };
}

/** A line for commits git didn't take yet, which spool makes at its next start. */
export function waitingNote(done: string, roots: readonly string[]): string | undefined {
	if (roots.length === 0) return undefined;
	return `${done} Its commit in ${saidList(roots.map(tilde))} waits for git, and spool makes it the next time it starts.`;
}

/** "Moved site to Northlight as tidemark-site. spool.json is committed in tidemark-site." */
export function teamMoveDone(was: string, moved: TeamMoveOutcome, to: CloudTeam): MoveDone {
	const as = moved.name === was ? "" : ` as ${moved.name}`;
	const committed =
		moved.committed.length === 0 ? "" : ` spool.json is committed in ${saidList(moved.committed.map(folderName))}.`;
	const note = waitingNote(`${was} moved to ${to.name}.`, moved.commitWaiting);
	return {
		toast: `Moved ${was} to ${to.name}${as}.${committed}`,
		...(note === undefined ? {} : { note }),
		show: to.address,
	};
}

/** How long a move's toast stays. */
const MOVED_TOAST_MS = 6_000;

/** A finished move's toast at the foot of Home, gone after a while or when dismissed. */
export function useMovedToast(): { toast: ReactNode; say: (message: string) => void } {
	const [said, setSaid] = useState<string | null>(null);
	const dismiss = useCallback(() => setSaid(null), []);
	const toast = said !== null && <MovedToast key={said} message={said} onDismiss={dismiss} />;
	return { toast, say: setSaid };
}

function MovedToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
	useEffect(() => {
		const timer = setTimeout(onDismiss, MOVED_TOAST_MS);
		return () => clearTimeout(timer);
	}, [onDismiss]);
	return (
		<div className="-translate-x-1/2 fixed bottom-6 left-1/2 z-20" data-moved-toast="">
			<Toast message={message} drain={MOVED_TOAST_MS} onDismiss={onDismiss} />
		</div>
	);
}
