// Mirrors src/ui/project-tab-menu.tsx; specimen callbacks are optional.
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ProjectMark, useMarkTeam } from "shared/ui/spool/project-icon";
import type { TabProject } from "shared/ui/spool/tab-strip";

const ITEM = "flex h-[30px] items-center rounded-sm px-3 text-left text-text hover:bg-surface type-control";

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
	onExport?: (() => void) | undefined;
	onCloseTab?: (() => void) | undefined;
	onChangeIcon?: (() => void) | undefined;
	/** Offered only while the icon is the project's own file: a favicon or a letter has nothing to remove. */
	onRemoveIcon?: (() => void) | undefined;
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
		<div
			ref={ref}
			role="menu"
			aria-label="Project actions"
			className="fixed z-50 flex w-[244px] flex-col rounded-md border border-border-raised bg-raised p-unit"
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
					name={project.name}
					icon={project.icon}
					team={project.teamAddress}
					paused={project.paused}
					size={24}
					cut="var(--color-raised)"
				/>
				<div className="flex min-w-0 flex-col gap-[1px]">
					<span className="truncate text-text type-control">{project.name}</span>
					<span className="truncate text-muted type-detail">
						{team === undefined ? "On this Mac" : `${team.name}${project.paused ? " · sync paused" : ""}`}
					</span>
				</div>
			</div>
			<div className="mx-2 my-unit h-px bg-border-raised" />
			{onChangeIcon && (
				<button type="button" role="menuitem" className={ITEM} onClick={() => act(onChangeIcon)}>
					Change icon…
				</button>
			)}
			{onRemoveIcon && project.icon?.from === "file" && (
				<button type="button" role="menuitem" className={ITEM} onClick={() => act(onRemoveIcon)}>
					Remove icon
				</button>
			)}
			<button type="button" role="menuitem" className={ITEM} onClick={() => act(() => onExport?.())}>
				Export project…
			</button>
			<div className="mx-2 my-unit h-px bg-border-raised" />
			<button type="button" role="menuitem" className={ITEM} onClick={() => act(() => onCloseTab?.())}>
				Close tab
			</button>
		</div>,
		document.body,
	);
}
