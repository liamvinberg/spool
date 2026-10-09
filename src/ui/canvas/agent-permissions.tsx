import { type ReactNode, useEffect, useRef, useState } from "react";
import { AGENT_PERMISSIONS, type AgentPermissions } from "../../settings/registry";
import { agentPermissions } from "../api";
import { cn } from "../cn";
import { CheckIcon } from "../icons";
import { useSettings } from "../settings";
import { AGENT_DEFAULTS_RETRY_MS, learnAgentMode } from "./agent-defaults";
import { Chevron, RailMenu } from "./agent-float";

export interface PermissionDeck {
	/** the machine's mode, or the pick on its way to being saved */
	readonly mode: AgentPermissions;
	/** a pick is being saved */
	readonly saving: boolean;
	/** this thread's running turn started on another mode and takes this one at its next turn */
	readonly pending: boolean;
	readonly reason: string | undefined;
	choose(mode: AgentPermissions): void;
}

/**
 * The permission menu's reading (#361): the machine's mode, never a guess. Undefined until
 * it is known, so the rail draws no mode it has not loaded; a failed read keeps what was
 * known and tries again. A pick shows at once, is saved, and the menu then holds the value
 * the daemon confirmed, which it never refuses.
 */
export function useAgentPermissions(
	project: string,
	thread: string,
	phase: string,
	known: AgentPermissions | undefined,
): PermissionDeck | undefined {
	const settings = useSettings(project);
	const [read, setRead] = useState<{ owner: string; mode: AgentPermissions; pending: boolean }>();
	const [picked, setPicked] = useState<AgentPermissions>();
	const [reason, setReason] = useState<string>();
	const owner = `${project}/${thread}`;
	const current = useRef(owner);
	current.current = owner;
	const picks = useRef(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a turn boundary or settings event is the cue to read again
	useEffect(() => {
		if (thread === "") return;
		let live = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const ask = () => {
			const picking = picks.current;
			void agentPermissions(project, thread).then((result) => {
				if (!live) return;
				if (!("mode" in result)) {
					timer = setTimeout(ask, AGENT_DEFAULTS_RETRY_MS);
					return;
				}
				// a pick made while this read was out is newer than what it says
				if (picks.current !== picking) return;
				setRead({ owner, mode: result.mode, pending: result.pending });
				learnAgentMode(result.mode);
			});
		};
		ask();
		return () => {
			live = false;
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [project, thread, owner, phase, settings]);
	const mine = read?.owner === owner ? read : undefined;
	const mode = picked ?? mine?.mode ?? known;
	if (mode === undefined || thread === "") return undefined;
	return {
		mode,
		saving: picked !== undefined,
		pending: picked === undefined && mine?.pending === true,
		reason,
		choose: (next) => {
			const pick = ++picks.current;
			const born = owner;
			setPicked(next);
			setReason(undefined);
			void agentPermissions(project, thread, next).then((result) => {
				if (picks.current !== pick) return;
				setPicked(undefined);
				if ("mode" in result) {
					learnAgentMode(result.mode);
					if (current.current === born) setRead({ owner: born, mode: result.mode, pending: result.pending });
				} else setReason(result.reason);
			});
		},
	};
}

/** the three modes as a person reads them (#364) */
export const MODE_NAMES: Readonly<Record<AgentPermissions, string>> = {
	ask: "Ask first",
	edits: "Auto-edit",
	bypass: "Full access",
};

/**
 * What each mode lets the agent do, in the spec's own sentences (#360). The words are the
 * promise every engine keeps, so none of them names one; `design/` is set as the path it is.
 */
const MODE_SAYS: Readonly<Record<AgentPermissions, ReactNode>> = {
	ask: (
		<>
			Asks before it edits outside <span className="type-detail">design/</span> or runs commands.
		</>
	),
	edits: "Edits files without asking. Asks before commands.",
	bypass: "Never asks.",
};

/**
 * The machine's one mode for every chat and every agent (#361, #364): a trigger naming the
 * mode, and a menu rising off it with each mode's name and what it means, the chosen one
 * checked, and a quiet footnote that it is global. Each engine enforces the mode its own
 * way; the words are the promise all of them keep.
 */
export function PermissionMenu({
	permissions,
	open,
	onOpen,
}: {
	permissions: PermissionDeck;
	open: boolean;
	onOpen: (open: boolean) => void;
}) {
	const { mode, pending, saving } = permissions;
	return (
		<RailMenu
			open={open}
			onOpen={onOpen}
			label="Agent permissions"
			className="absolute bottom-full left-0 z-30 mb-2 w-[300px] max-w-full"
			panel={{ "data-permission-menu": "" }}
			trigger={(props) => (
				<button
					type="button"
					{...props}
					data-permission-trigger=""
					aria-label={`Agent permissions: ${MODE_NAMES[mode]}`}
					title={
						pending
							? `${MODE_NAMES[mode]}, from the next turn. Applies to every chat.`
							: `${MODE_NAMES[mode]}. Applies to every chat.`
					}
					aria-busy={saving}
					className="relative z-30 flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-text aria-expanded:bg-surface aria-expanded:text-text type-control"
				>
					{MODE_NAMES[mode]}
					<Chevron open={open} />
				</button>
			)}
		>
			<div className="flex flex-col p-1">
				{AGENT_PERMISSIONS.map((choice) => (
					<button
						key={choice}
						type="button"
						role="menuitemradio"
						aria-checked={choice === mode}
						data-permission-mode={choice}
						onClick={() => {
							onOpen(false);
							permissions.choose(choice);
						}}
						className="flex w-full items-start gap-2 rounded-sm py-2 pr-2 pl-3 text-left outline-none transition-colors duration-150 hover:bg-raised focus-visible:bg-raised"
					>
						<span className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="text-text type-control">{MODE_NAMES[choice]}</span>
							<span className="text-muted type-label [text-wrap:pretty]">{MODE_SAYS[choice]}</span>
						</span>
						<CheckIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-text", choice !== mode && "invisible")} />
					</button>
				))}
				<p className="mx-3 mt-1 border-border border-t pt-2 pb-1.5 text-muted type-caption">
					{pending ? "Applies when this turn ends. " : null}Applies to every chat.
				</p>
			</div>
		</RailMenu>
	);
}
