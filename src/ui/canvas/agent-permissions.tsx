import { type RefObject, useEffect, useRef, useState } from "react";
import type { AgentPermissions } from "../../settings/registry";
import { agentPermissions } from "../api";
import { cn } from "../cn";
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

/** The machine's one mode for every engine; each engine enforces its own modes. */
export function PermissionMenu({
	mode,
	pending,
	engine,
	trigger,
	onChange,
	onClose,
}: {
	mode: AgentPermissions;
	pending: boolean;
	engine: "spool" | "claude";
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
			className="absolute right-0 bottom-full z-30 mb-2 w-[250px] max-w-full animate-agent-menu-in rounded-md border border-border-raised bg-raised p-1.5"
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
					aria-label={choice}
					onClick={() => onChange(choice)}
					className={cn(
						"flex w-full items-start gap-3 rounded-sm px-2 py-2 text-left outline-none hover:bg-surface focus-visible:bg-surface",
						choice === mode && "bg-surface",
					)}
				>
					<span className="flex min-w-0 flex-1 flex-col gap-1">
						<span className="font-mono text-xs text-text leading-4">{choice}</span>
						<span className="text-2xs text-muted leading-4">
							{choice === "ask"
								? engine === "spool"
									? "Ask before access outside design/."
									: "Use Claude Code’s approval rules."
								: choice === "edits"
									? "Allow file edits. Ask before commands."
									: engine === "spool"
										? "Skip tool approvals and command restrictions."
										: "Skip tool approvals."}
						</span>
					</span>
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						fill="none"
						className={cn("mt-0.5 h-3 w-3 shrink-0 text-muted", choice !== mode && "invisible")}
					>
						<path
							d="m3.5 8 3 3 6-6"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
			))}
			<p className="border-border border-t px-2 pt-2 pb-1 text-2xs text-muted leading-4">
				{pending ? "Applies when this turn ends. " : null}Every new chat on this machine starts here.
			</p>
		</div>
	);
}
