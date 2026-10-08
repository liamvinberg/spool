import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { AgentPermissions } from "../../settings/registry";
import { agentPermissions } from "../api";
import { cn } from "../cn";
import { CheckIcon } from "../icons";
import { useSettings } from "../settings";
import { AGENT_DEFAULTS_RETRY_MS, learnAgentMode } from "./agent-defaults";

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

/** what each mode lets the agent do, in a sentence; `design/` is set as the path it is */
/** what each mode lets the agent do, the ask line naming whose approval rules it is (#362) */
const modeSays = (engine: string): Readonly<Record<AgentPermissions, ReactNode>> => ({
	ask: (
		<>
			{engine} asks before it edits outside <span className="type-detail">design/</span> or runs commands.
		</>
	),
	edits: "Edits files without asking. Asks before commands.",
	bypass: "Never asks.",
});

/**
 * The machine's one mode for every chat and every agent (#361, #364): each mode its name
 * and what it means, the chosen one checked, and a quiet footnote that it is global.
 * Each engine enforces the mode its own way; the words are the promise all of them keep.
 */
export function PermissionMenu({
	mode,
	pending,
	engine = "Claude Code",
	trigger,
	onChange,
	onClose,
}: {
	mode: AgentPermissions;
	/** whose approval rules ask is, by the name the rail calls the thread's engine */
	engine?: string;
	pending: boolean;
	trigger: RefObject<HTMLButtonElement | null>;
	onChange: (mode: AgentPermissions) => void;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
		return () => trigger.current?.focus();
	}, [trigger]);
	return (
		<div
			ref={ref}
			role="menu"
			aria-label="Agent permissions"
			data-permission-menu=""
			className="flex flex-col p-1"
			onKeyDown={(event) => {
				if (event.key === "Escape" || event.key === "Tab") {
					event.preventDefault();
					event.stopPropagation();
					onClose();
					return;
				}
				if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
				event.preventDefault();
				const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
				const index =
					document.activeElement instanceof HTMLButtonElement ? items.indexOf(document.activeElement) : -1;
				const next =
					event.key === "Home"
						? 0
						: event.key === "End"
							? items.length - 1
							: (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
				items[next]?.focus();
			}}
		>
			{(["ask", "edits", "bypass"] as const).map((choice) => (
				<button
					key={choice}
					type="button"
					role="menuitemradio"
					aria-checked={choice === mode}
					data-permission-mode={choice}
					onClick={() => onChange(choice)}
					className="flex w-full items-start gap-2 rounded-sm py-2 pr-2 pl-3 text-left outline-none transition-colors duration-150 hover:bg-raised focus-visible:bg-raised"
				>
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-text type-control">{MODE_NAMES[choice]}</span>
						<span className="text-muted type-label [text-wrap:pretty]">{modeSays(engine)[choice]}</span>
					</span>
					<CheckIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-text", choice !== mode && "invisible")} />
				</button>
			))}
			<p className="mx-3 mt-1 border-border border-t pt-2 pb-1.5 text-muted type-caption">
				{pending ? "Applies when this turn ends. " : null}Applies to every chat.
			</p>
		</div>
	);
}
