import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
	type CanvasSync,
	fetchSyncState,
	matchTeam,
	postForgetProject,
	putBackInGit,
	type SyncState,
	upgradeProject,
} from "../api";
import { type AppUpdate, type DesktopBridge, desktopBridge } from "../desktop-bridge";
import { MovedSheet } from "../moved-away";
import { TextAction, Toast } from "../primitives/feedback";
import { Popover } from "../primitives/overlays";
import { keep, recall } from "../remembered";
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
 * ended here, that it has gone local until its team pays, that sync is paused on a limit or until Spool is updated, that changes are waiting
 * out a long spell on the minute's limit, and that it has been offline a while, each with Match the team beside it, and
 * which files didn't travel, which matching leaves as they are. A solo project's canvas says nothing. One whose design/ moved into a team this account
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
				project={project}
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
				{...(state.formatUpgrade === true
					? {
							onUpgrade: async () => {
								const upgraded = await upgradeProject(project);
								refresh();
								return upgraded ? null : UPGRADE_FAILED;
							},
						}
					: {})}
			/>
		</>
	);
}

/**
 * What a state says, one line each, keyed by its words: a line closed stays closed until it says something else. A
 * long wait is keyed as one line however its count changes, so it counts down in place, and once closed it stays
 * closed until that wait ends.
 */
function linesOf(
	{ ended, goneLocal, paused, sending, held, backInGit, offline, update }: SyncState,
	inApp: boolean,
): Line[] {
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
	// an older Spool (#206): the Mac app's update in the app, the npm command in a browser on the CLI's daemon
	if (update !== null) {
		const line = `Update Spool to keep syncing with ${update.team}`;
		if (inApp) lines.push({ key: UPDATE, text: `${line}.`, matches: false, update: true });
		else if (update.how === "cli")
			lines.push({ key: UPDATE, text: `${line}:`, matches: false, command: update.command });
		else lines.push({ key: UPDATE, text: `${line}: Check for Updates in the Spool app.`, matches: false });
	}
	if (offline) say(OFFLINE);
	if (sending !== null) lines.push({ key: SENDING, text: `${sending}.`, matches: true });
	// matching the team leaves a file that didn't travel as it is, so the line offers no match
	const [only] = held;
	if (held.length === 1 && only !== undefined) say(`${only.path} didn't travel: ${only.why}`, false);
	else if (held.length > 1) say(`${held.length} files didn't travel`, false);
	return lines;
}

/** A notice's line: `matches` stands Match the team beside it, `back` offers Put design/ back in git on it. */
interface Line {
	key: string;
	text: string;
	/** Match the team stands beside it. */
	matches: boolean;
	back?: boolean;
	/** The command that does what it says, in mono beside it. */
	command?: string;
	/** The Mac app's update stands beside it. */
	update?: true;
}

const SENDING = "sending";
const UPDATE = "update";
const UPGRADE = "upgrade";
/** Spool Beta's held format upgrade (spool#282), said on the canvas until a person upgrades or closes it. */
export const UPGRADE_LINE =
	"This project is in an older format, so some walks read as missing. Upgrade it here, and the released spool may need an update before it opens the project again.";
const UPGRADE_FAILED = "The upgrade didn't finish. Try again, and if it fails again the daemon's log says why.";
const UPGRADE_REFUSED = "upgrade-refused";
const REFUSED = "refused";
export const OFFLINE = "Offline. Your changes go up when you're back.";

/** What putting design/ back in git came to, said once it is done or refused. */
const BACK = "back-in-git";

/** Where a browser keeps the files of a project whose didn't-travel line was closed. */
const closedHeldKey = (project: string) => `sync.closed-held.${project}`;
const isPaths = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((one) => typeof one === "string");

export function SyncNotices({
	project,
	state: said,
	refused,
	onMatchTeam,
	onRefusedRead,
	onBackInGit,
	onUpgrade,
	bridge = desktopBridge(),
}: {
	/** Whose notices these are: a didn't-travel line closed stays closed across reloads, in this browser. */
	project?: string | undefined;
	state: SyncState;
	/** The Mac app's bridge, when the canvas is in its window: its update is the update line's action. */
	bridge?: DesktopBridge | undefined;
	/** Why Match the team was last refused, said until it is closed. */
	refused?: string | undefined;
	onMatchTeam?: (() => void) | undefined;
	onRefusedRead?: (() => void) | undefined;
	/** Put design/ back in git (#198), resolving to the sentence that says what came of it. */
	onBackInGit?: (() => Promise<string>) | undefined;
	/** Present while Spool Beta holds the project's format upgrade (spool#282): runs it, resolving to a refusal or null. */
	onUpgrade?: (() => Promise<string | null>) | undefined;
}) {
	const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
	// files a closed didn't-travel line named stay unsaid in this browser: a person who closed it knows, and a new
	// file held is still said, on a line of its own count
	const [closedHeld, setClosedHeld] = useState<ReadonlySet<string>>(
		() => new Set(project === undefined ? [] : (recall(closedHeldKey(project), isPaths) ?? [])),
	);
	const state = { ...said, held: said.held.filter(({ path }) => !closedHeld.has(path)) };
	const closeHeld = () => {
		const next = new Set([...closedHeld, ...state.held.map(({ path }) => path)]);
		setClosedHeld(next);
		if (project !== undefined) keep(closedHeldKey(project), [...next]);
	};
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
	const [appUpdate, setAppUpdate] = useState<AppUpdate | null>(bridge?.update ?? null);
	useEffect(() => bridge?.onUpdate(setAppUpdate), [bridge]);
	// a wait closed while it lasted is said again when the next one begins
	if (state.sending === null && closed.has(SENDING))
		setClosed((was) => new Set([...was].filter((key) => key !== SENDING)));
	const inApp = bridge !== undefined;
	const [upgrading, setUpgrading] = useState(false);
	const [upgradeSaid, setUpgradeSaid] = useState<string | null>(null);
	const upgrade = async () => {
		if (onUpgrade === undefined || upgrading) return;
		setUpgrading(true);
		try {
			setUpgradeSaid(await onUpgrade());
		} finally {
			setUpgrading(false);
		}
	};
	const lines: Line[] = [
		...(onUpgrade === undefined ? [] : [{ key: UPGRADE, text: UPGRADE_LINE, matches: false }]),
		...linesOf(state, inApp),
		...(refused === undefined ? [] : [{ key: REFUSED, text: refused, matches: false }]),
		...(backSaid === null ? [] : [{ key: BACK, text: backSaid, matches: false }]),
		...(upgradeSaid === null ? [] : [{ key: UPGRADE_REFUSED, text: upgradeSaid, matches: false }]),
	].filter((line) => !closed.has(line.key));
	if (lines.length === 0) return null;
	const heldKey = state.held.length > 0 ? linesOf(state, inApp).at(-1)?.key : undefined;
	const many = state.held.length > 1 ? heldKey : undefined;
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
			{lines.map(({ key, text, matches, back, command, update }) => {
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
				const upgradeAction = key === UPGRADE && (
					<TextAction disabled={upgrading} onClick={() => void upgrade()}>
						Upgrade
					</TextAction>
				);
				const match = matches && onMatchTeam !== undefined && (
					<TextAction onClick={onMatchTeam}>Reset to team's version</TextAction>
				);
				// the app downloads its update by itself: the action stands once it is ready to restart into
				const install =
					update === true &&
					(appUpdate?.kind === "ready" ? (
						<TextAction onClick={() => bridge?.install()}>Update</TextAction>
					) : (
						<span className="shrink-0 text-secondary type-detail">Check for Updates in the Spool menu</span>
					));
				return (
					<Toast
						key={key}
						data-sync-state=""
						className="max-w-sheet"
						message={text}
						{...(command === undefined ? {} : { detail: <span className="select-all">{command}</span> })}
						action={
							show || putBackAction || upgradeAction || match || install ? (
								<>
									{show}
									{putBackAction}
									{upgradeAction}
									{match}
									{install}
								</>
							) : undefined
						}
						onDismiss={() => {
							// a refusal closed is read: the next one is said afresh
							if (key === REFUSED) onRefusedRead?.();
							else if (key === UPGRADE_REFUSED) setUpgradeSaid(null);
							else if (key === heldKey) closeHeld();
							else setClosed((was) => new Set([...was, key]));
						}}
					/>
				);
			})}
		</>
	);
}
