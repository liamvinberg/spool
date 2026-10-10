import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Menu, MenuItem, MenuSeparator } from "./primitives/overlays";
import { ProjectMark, useMarkTeam } from "./project-icon";
import type { TabProject } from "./tab-strip";

/**
 * A tab's menu opens on its project: the icon as the tab draws it and the name, over where it lives, a team (and
 * that its sync is paused) or this Mac. Then what can be done to it.
 */
export function ProjectTabMenu({
	project,
	x,
	y,
	anchor,
	onClose,
	onExport,
	onCloseTab,
	onChangeIcon,
	onRemoveIcon,
}: {
	project: TabProject;
	x: number;
	y: number;
	anchor: HTMLElement;
	onClose: () => void;
	onExport: () => void;
	onCloseTab: () => void;
	onChangeIcon?: () => void;
	/** Offered only while the icon is the project's own file: a favicon or a letter has nothing to remove. */
	onRemoveIcon?: () => void;
}) {
	const team = useMarkTeam(project.teamAddress);
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const menu = ref.current;
		if (!menu) return;
		menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
		menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
		menu.querySelector<HTMLButtonElement>("button")?.focus();
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !menu.contains(event.target)) onClose();
		};
		document.addEventListener("pointerdown", outside, true);
		return () => {
			document.removeEventListener("pointerdown", outside, true);
			if (anchor.isConnected) anchor.focus();
		};
	}, [x, y, anchor, onClose]);
	const act = (action: () => void) => {
		anchor.focus();
		onClose();
		action();
	};
	return createPortal(
		<Menu
			ref={ref}
			aria-label="Project actions"
			className="fixed z-50"
			onKeyDown={(event) => {
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
			{onChangeIcon && <MenuItem label="Change icon…" onClick={() => act(onChangeIcon)} />}
			{onRemoveIcon && project.icon?.from === "file" && (
				<MenuItem label="Remove icon" onClick={() => act(onRemoveIcon)} />
			)}
			<MenuItem label="Export project…" onClick={() => act(onExport)} />
			<MenuSeparator />
			<MenuItem label="Close tab" onClick={() => act(onCloseTab)} />
		</Menu>,
		document.body,
	);
}
