import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type CanvasSync, fetchSyncState, matchTeam, postForgetProject, putBackInGit, type SyncState } from "../api";
import { MovedSheet } from "../moved-away";
import { TextAction, Toast } from "../primitives/feedback";
import { Popover } from "../primitives/overlays";
import { backInGitDone } from "../team-move";

/** Said whenever a project's sync changes, so its canvas reads it again. */
export const SYNC_CHANGED = "spool-sync-change";

/** What Match the team was last refused with, by project, until it is closed or a match goes through. */
const refusals = new Map<string, string>();

/**
 * Match the team on a project's local copy (#205), from its Sync box or its tab's menu: the daemon makes the copy the
 * team's and keeps each difference as a set-aside mark, whose own notice says so. A refusal (no connection) is said in
 * the Sync box, which reads it again either way.
 */
export async function matchTheTeam(project: string): Promise<void> {
	refusals.delete(project);
	const answer = await matchTeam(project);
	if ("refused" in answer) refusals.set(project, answer.refused);
	window.dispatchEvent(new CustomEvent(SYNC_CHANGED));
}

/**
 * A team project's sync, said on its canvas for as long as it lasts and whenever the canvas opens: that the project
 * ended here, that it has gone local until its team pays, that sync is paused on a limit, that changes are waiting
 * out a long spell on the minute's limit, that it has been offline a while, and which files didn't travel, each with
 * Match the team beside it. A solo project's canvas says nothing. One whose design/ moved into a team this account
 * can't edit stands the moved sheet over the canvas (spool#194).
 */
export function useSyncState(project: string, root?: string): ReactNode {
	const [state, setState] = useState<CanvasSync | undefined>(undefined);
	// the moved sheet, once put away, stays away until it has something else to say
	const [putAway, setPutAway] = useState<string | null>(null);
	const [refused, setRefused] = useState<string | undefined>(undefined);
	const revision = useRef(0);
	const refresh = useCallback(() => {
		const asked = ++revision.current;
		void fetchSyncState(project).then((next) => {
			if (asked !== revision.current) return;
			setState(next);
			setRefused(refusals.get(project));
		});
	}, [project]);
	useEffect(() => {
		refresh();
		window.addEventListener(SYNC_CHANGED, refresh);
		window.addEventListener("focus", refresh);
		return () => {
			revision.current++;
			window.removeEventListener(SYNC_CHANGED, refresh);
			window.removeEventListener("focus", refresh);
		};
	}, [refresh]);
	if (state === undefined) return null;
	const moved = state.moved;
	const movedKey = moved === null ? null : `${moved.standing}\n${moved.commit?.hash ?? ""}`;
	return (
		<>
			{moved !== null && movedKey !== putAway && (
				<MovedSheet
					name={project}
					moved={moved}
					onRemove={() => {
						if (root !== undefined) void postForgetProject(root);
					}}
					onClose={() => setPutAway(movedKey)}
				/>
			)}
			<SyncNotices
				state={state}
				refused={refused}
				onMatchTeam={() => void matchTheTeam(project)}
				onRefusedRead={() => {
					refusals.delete(project);
					setRefused(undefined);
				}}
				onBackInGit={async () => {
					const done = backInGitDone(await putBackInGit(project));
					refresh();
					return done.note ?? done.toast;
				}}
			/>
		</>
	);
}

/**
 * What a state says, one line each, keyed by its words: a line closed stays closed until it says something else. A
 * long wait is keyed as one line however its count changes, so it counts down in place, and once closed it stays
 * closed until that wait ends.
 */
function linesOf({ ended, goneLocal, paused, sending, held, backInGit, offline }: SyncState): Line[] {
	const lines: Line[] = [];
	const say = (text: string, matches = true, back = false) =>
		lines.push({ key: text, text, matches, ...(back ? { back } : {}) });
	// a copy that no longer follows its team has no team to match
	if (ended !== null) say(`No longer synced with ${ended}. This is now a project on this Mac only.`, false, backInGit);
	if (goneLocal !== null)
		say(
			`${goneLocal} has gone local. Your copy keeps working here and syncs again once the team pays.`,
			false,
			backInGit && ended === null,
		);
	if (paused !== null) say(`Sync paused: ${paused}. Changes stay on this Mac until it lifts.`);
	if (offline) say(OFFLINE);
	if (sending !== null) lines.push({ key: SENDING, text: `${sending}.`, matches: true });
	const [only] = held;
	if (held.length === 1 && only !== undefined) say(`${only.path} didn't travel: ${only.why}`);
	else if (held.length > 1) say(`${held.length} files didn't travel`);
	return lines;
}

/** A notice's line: `matches` stands Match the team beside it, `back` offers Put design/ back in git on it. */
type Line = { key: string; text: string; matches: boolean; back?: boolean };

const SENDING = "sending";
const REFUSED = "refused";
export const OFFLINE = "Offline. Your changes go up when you're back.";

/** What putting design/ back in git came to, said once it is done or refused. */
const BACK = "back-in-git";

export function SyncNotices({
	state,
	refused,
	onMatchTeam,
	onRefusedRead,
	onBackInGit,
}: {
	state: SyncState;
	/** Why Match the team was last refused, said until it is closed. */
	refused?: string | undefined;
	onMatchTeam?: (() => void) | undefined;
	onRefusedRead?: (() => void) | undefined;
	/** Put design/ back in git (#198), resolving to the sentence that says what came of it. */
	onBackInGit?: (() => Promise<string>) | undefined;
}) {
	const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
	const [open, setOpen] = useState(false);
	const [backSaid, setBackSaid] = useState<string | null>(null);
	const [putting, setPutting] = useState(false);
	const putBack = async () => {
		if (onBackInGit === undefined || putting) return;
		setPutting(true);
		try {
			setBackSaid(await onBackInGit());
		} catch (error) {
			setBackSaid(error instanceof Error ? error.message : "Could not finish. Try again.");
		} finally {
			setPutting(false);
		}
	};
	// a wait closed while it lasted is said again when the next one begins
	if (state.sending === null && closed.has(SENDING))
		setClosed((was) => new Set([...was].filter((key) => key !== SENDING)));
	const lines: Line[] = [
		...linesOf(state),
		...(refused === undefined ? [] : [{ key: REFUSED, text: refused, matches: false }]),
		...(backSaid === null ? [] : [{ key: BACK, text: backSaid, matches: false }]),
	].filter((line) => !closed.has(line.key));
	if (lines.length === 0) return null;
	const many = state.held.length > 1 ? linesOf(state).at(-1)?.key : undefined;
	return (
		<>
			{open && many !== undefined && lines.some((line) => line.key === many) && (
				<Popover aria-label="Files that didn't travel" className="max-h-[40vh] w-toast gap-1 overflow-auto">
					<ul className="flex flex-col gap-1">
						{state.held.map(({ path, why }) => (
							<li key={path} className="text-secondary type-detail">
								<span className="font-mono text-primary">{path}</span> {why}
							</li>
						))}
					</ul>
				</Popover>
			)}
			{lines.map(({ key, text, matches, back }) => {
				const show = key === many && (
					<TextAction aria-expanded={open} onClick={() => setOpen((was) => !was)}>
						{open ? "Hide" : "Show"}
					</TextAction>
				);
				const putBackAction = back === true && onBackInGit !== undefined && (
					<TextAction disabled={putting} onClick={() => void putBack()}>
						Put design/ back in git
					</TextAction>
				);
				const match = matches && onMatchTeam !== undefined && (
					<TextAction onClick={onMatchTeam}>Match the team</TextAction>
				);
				return (
					<Toast
						key={key}
						data-sync-state=""
						className="max-w-sheet"
						message={text}
						action={
							show || putBackAction || match ? (
								<>
									{show}
									{putBackAction}
									{match}
								</>
							) : undefined
						}
						onDismiss={() => {
							// a refusal closed is read: the next one is said afresh
							if (key === REFUSED) onRefusedRead?.();
							else setClosed((was) => new Set([...was, key]));
						}}
					/>
				);
			})}
		</>
	);
}
