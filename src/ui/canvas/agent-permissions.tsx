import { type RefObject, useEffect, useRef, useState } from "react";
import type { AgentEngineId } from "../../daemon/agent-engine";
import type { AgentPermissions } from "../../settings/registry";
import { agentPermissions } from "../api";
import { cn } from "../cn";
import { settingsMoved, useSettings } from "../settings";

export interface PermissionDeck {
	readonly mode: AgentPermissions;
	readonly pending: boolean;
	readonly reason: string | undefined;
	choose(mode: AgentPermissions): void;
}

export function useAgentPermissions(
	project: string,
	thread: string,
	engine: AgentEngineId,
	phase: string,
): PermissionDeck {
	const settings = useSettings(project);
	const [mode, setMode] = useState<AgentPermissions>("ask");
	const [pending, setPending] = useState(false);
	const [reason, setReason] = useState<string>();
	const revision = useRef(0);
	const owner = `${project}/${thread}/${engine}`;
	const current = useRef(owner);
	const applying = useRef(false);
	const generation = useRef(0);
	current.current = owner;
	// biome-ignore lint/correctness/useExhaustiveDependencies: changing thread ownership retires its pending UI operation
	useEffect(() => {
		++generation.current;
		applying.current = false;
		setPending(false);
		setReason(undefined);
		return () => {
			++generation.current;
		};
	}, [owner]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a turn boundary or settings event invalidates the engine reading
	useEffect(() => {
		const read = ++revision.current;
		void agentPermissions(project, thread, engine).then((result) => {
			if (!applying.current && revision.current === read && current.current === owner && "mode" in result)
				setMode(result.mode);
		});
		return () => {
			++revision.current;
		};
	}, [project, thread, engine, owner, phase, settings]);
	return {
		mode,
		pending,
		reason,
		choose: (next) => {
			if (applying.current) return;
			applying.current = true;
			++revision.current;
			const born = generation.current;
			setPending(true);
			setReason(undefined);
			void agentPermissions(project, thread, engine, next).then(async (result) => {
				if (current.current !== owner || generation.current !== born) return;
				applying.current = false;
				setPending(false);
				if ("mode" in result) {
					setMode(result.mode);
					settingsMoved();
				} else {
					setReason(result.reason);
					// A transport/save failure can follow an engine acknowledgement.
					// Read the engine again instead of guessing which side took effect.
					const read = ++revision.current;
					const effective = await agentPermissions(project, thread, engine);
					if (
						current.current === owner &&
						generation.current === born &&
						revision.current === read &&
						"mode" in effective
					)
						setMode(effective.mode);
				}
			});
		},
	};
}

/** The same project preference for both engines; each engine enforces its own modes. */
export function PermissionMenu({
	mode,
	engine,
	trigger,
	onChange,
	onClose,
}: {
	mode: AgentPermissions;
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
				This project, on this machine.
			</p>
		</div>
	);
}
