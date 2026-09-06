import { type RefObject, useEffect, useRef, useState } from "react";
import type { AgentEngineId } from "../../daemon/agent-engine";
import { fetchAgentInstalled } from "../api";
import { cn } from "../cn";
import type { AgentModelDeck } from "./agent-model";
import { ChevronIcon } from "./sidebar";

const NAMES = { spool: "spool", claude: "Claude Code" };

export function AgentChoice({
	model,
	menu,
	onMenu,
	onNew,
	newTrigger,
}: {
	model: AgentModelDeck;
	menu: "agent" | "new" | null;
	onMenu: (menu: "agent" | "new" | null) => void;
	onNew: (engine?: AgentEngineId) => void;
	newTrigger: RefObject<HTMLButtonElement | null>;
}) {
	const [installed, setInstalled] = useState<boolean | null>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const panel = useRef<HTMLDivElement>(null);
	const engine = model.engine ?? "claude";
	useEffect(() => {
		if (menu === null) return;
		let active = true;
		panel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
		if (model.project)
			void fetchAgentInstalled(model.project, "claude").then((value) => {
				if (active) setInstalled(value);
			});
		return () => {
			active = false;
		};
	}, [menu, model.project]);
	const close = () => {
		onMenu(null);
		(menu === "new" ? newTrigger : trigger).current?.focus({ preventScroll: true });
	};
	return (
		<>
			<div className="flex h-8 items-center justify-between px-3.5 pb-2">
				{model.started ? (
					<span
						data-fixed-agent=""
						title="This chat keeps its agent. Use + to start with another."
						className="flex items-center gap-1.5 text-muted type-detail"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 16 16"
							className="h-2.5 w-2.5 text-muted/65"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.2"
						>
							<rect x="3.5" y="7" width="9" height="7" rx="1.5" />
							<path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" />
						</svg>
						{NAMES[engine]}
					</span>
				) : (
					<button
						type="button"
						ref={trigger}
						aria-label="Choose agent for this new chat"
						aria-expanded={menu === "agent"}
						onClick={() => onMenu(menu === "agent" ? null : "agent")}
						className="relative z-30 flex items-center gap-1.5 text-muted type-detail hover:text-text"
					>
						{NAMES[engine]}
						<ChevronIcon open={menu === "agent"} className="h-2 w-2" />
					</button>
				)}
				{!model.started ? <span className="text-muted/65 type-caption">For this new chat</span> : null}
			</div>
			{menu !== null ? (
				<>
					<button
						type="button"
						tabIndex={-1}
						aria-label="Close agent menu"
						className="fixed inset-0 z-20 cursor-default"
						onClick={close}
					/>
					<div
						ref={panel}
						role="dialog"
						aria-label={menu === "new" ? "Start a new chat" : "Choose an agent"}
						className="absolute top-full right-3 left-3 z-40 mt-1 overflow-hidden rounded-md border border-border-raised bg-surface p-1.5"
						onKeyDown={(event) => {
							if (event.key === "Escape" || event.key === "Tab") {
								event.preventDefault();
								event.stopPropagation();
								close();
							}
							if (event.key === "ArrowDown" || event.key === "ArrowUp") {
								event.preventDefault();
								const choices = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
								const index =
									document.activeElement instanceof HTMLButtonElement
										? choices.indexOf(document.activeElement)
										: -1;
								choices[
									(index + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length
								]?.focus();
							}
						}}
					>
						{(["spool", "claude"] as const).map((value) => (
							<button
								type="button"
								key={value}
								data-agent-engine={value}
								onClick={() => {
									if (menu === "new") onNew(value);
									else if (!model.started) model.onEngine?.(value);
									close();
								}}
								className={cn(
									"flex w-full flex-col gap-1 rounded-sm px-2 py-2.5 text-left hover:bg-raised",
									menu === "agent" && engine === value && "bg-raised/50",
								)}
							>
								<span className="text-text type-control">
									{menu === "new" ? `New chat with ${NAMES[value]}` : NAMES[value]}
								</span>
								<span className="text-muted type-caption">
									{value === "spool"
										? "Uses your connected accounts."
										: installed === false
											? "Not installed on this Mac."
											: "Uses Claude Code on this Mac."}
								</span>
							</button>
						))}
						<p className="border-border-raised border-t px-2 pt-2 pb-1 text-muted type-caption">
							The agent stays with the chat after your first message.
						</p>
					</div>
				</>
			) : null}
		</>
	);
}
