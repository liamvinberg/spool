import { type RefObject, useEffect, useRef } from "react";
import { cn } from "shared/lib/utils";
import { CheckIcon } from "shared/ui/spool/icons";

export type PermissionMode = "ask" | "edits" | "bypass";

/** The same project preference for both engines; each engine enforces its own modes. */
export function PermissionMenu({
	mode,
	engine,
	trigger,
	onChange,
	onClose,
}: {
	mode: PermissionMode;
	engine: "spool" | "claude";
	trigger: RefObject<HTMLButtonElement | null>;
	onChange: (mode: PermissionMode) => void;
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
				const index = items.findIndex((item) => item === document.activeElement);
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
					<CheckIcon className={cn("mt-0.5 h-3 w-3 shrink-0 text-muted", choice !== mode && "invisible")} />
				</button>
			))}
			<p className="border-border border-t px-2 pt-2 pb-1 text-2xs text-muted leading-4">
				This project, on this machine.
			</p>
		</div>
	);
}
