import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MenuItem, MenuSeparator, StepMenu } from "./primitives/overlays";
import { ProjectMark, useMarkTeam } from "./project-icon";
import { useProjectExport } from "./project-transfer";
import type { TabProject } from "./tab-strip";

/**
 * A tab's menu opens on its project: the icon as the tab draws it and the name, over where it lives, a team (and
 * that its sync is paused) or this Mac. Then what can be done to it. Export project… never leaves it: the menu
 * goes on into building the .spool and where it was saved (spool#240).
 */
export function ProjectTabMenu({
	project,
	x,
	y,
	anchor,
	onClose,
	onCloseTab,
	onRename,
	onChangeIcon,
	onRemoveIcon,
	onMatchTeam,
	onHistory,
}: {
	project: TabProject;
	x: number;
	y: number;
	anchor: HTMLElement;
	onClose: () => void;
	onCloseTab: () => void;
	/** "Rename…": the tab's name becomes a field in place. Not offered to a viewer of the project's team. */
	onRename?: () => void;
	onChangeIcon?: () => void;
	/** Offered only while the icon is the project's own file: a favicon or a letter has nothing to remove. */
	onRemoveIcon?: () => void;
	/** Offered on a team project's tab only: makes its local copy the team's, keeping each difference as a mark. */
	onMatchTeam?: () => void;
	/** "History…": the project's team history in its History pane, offered on a team project's tab (spool#187). */
	onHistory?: () => void;
}) {
	const team = useMarkTeam(project.teamAddress);
	const exporting = useProjectExport(project, onClose);
	const ref = useRef<HTMLDivElement>(null);
	const closing = useRef(onClose);
	closing.current = onClose;
	// after the box takes the focus as it opens: the first verb has it, for the arrows to walk from
	useEffect(() => {
		const menu = ref.current;
		if (!menu) return;
		menu.querySelector<HTMLButtonElement>("button")?.focus();
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !menu.contains(event.target)) closing.current();
		};
		document.addEventListener("pointerdown", outside, true);
		return () => {
			document.removeEventListener("pointerdown", outside, true);
			if (anchor.isConnected) anchor.focus();
		};
	}, [anchor]);
	const act = (action: () => void) => {
		anchor.focus();
		onClose();
		action();
	};
	return createPortal(
		<StepMenu
			ref={ref}
			at={{ x, y }}
			step={exporting.step?.kind ?? "menu"}
			aria-label="Project actions"
			className="fixed z-50"
			onKeyDown={(event) => {
				if (event.key === "Enter" && exporting.enter !== undefined) {
					event.preventDefault();
					event.stopPropagation();
					exporting.enter();
					return;
				}
				if (["Escape", "Tab"].includes(event.key)) {
					event.preventDefault();
					event.stopPropagation();
					onClose();
				}
				if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
					event.preventDefault();
					const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
					const index =
						document.activeElement instanceof HTMLButtonElement ? items.indexOf(document.activeElement) : -1;
					items[
						event.key === "Home"
							? 0
							: event.key === "End"
								? items.length - 1
								: (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
					]?.focus();
				}
			}}
		>
			{exporting.view ?? (
				<>
					<div className="flex items-center gap-[10px] px-3 pt-[8px] pb-[7px]">
						<ProjectMark
							project={project.name}
							name={project.name}
							icon={project.icon}
							team={project.teamAddress}
							paused={project.paused}
							size="md"
							cut="var(--color-surface-raised)"
						/>
						<div className="flex min-w-0 flex-col gap-[1px]">
							<span className="truncate text-primary type-control">{project.name}</span>
							<span className="truncate text-secondary type-detail">
								{team === undefined ? "On this Mac" : `${team.name}${project.paused ? " · sync paused" : ""}`}
							</span>
						</div>
					</div>
					<MenuSeparator />
					{onRename && team?.role !== "viewer" && <MenuItem label="Rename…" onClick={() => act(onRename)} />}
					{onChangeIcon && <MenuItem label="Change icon…" onClick={() => act(onChangeIcon)} />}
					{onRemoveIcon && project.icon?.from === "file" && (
						<MenuItem label="Remove icon" onClick={() => act(onRemoveIcon)} />
					)}
					<MenuItem label="Export project…" onClick={exporting.start} />
					{onMatchTeam && project.teamAddress !== undefined && (
						<MenuItem label="Reset to team's version" onClick={() => act(onMatchTeam)} />
					)}
					{onHistory && project.teamAddress !== undefined && (
						<MenuItem label="History…" onClick={() => act(onHistory)} />
					)}
					<MenuSeparator />
					<MenuItem label="Close tab" onClick={() => act(onCloseTab)} />
				</>
			)}
		</StepMenu>,
		document.body,
	);
}
