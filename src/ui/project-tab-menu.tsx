import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function ProjectTabMenu({
	x,
	y,
	anchor,
	onClose,
	onExport,
	onCloseTab,
}: {
	x: number;
	y: number;
	anchor: HTMLElement;
	onClose: () => void;
	onExport: () => void;
	onCloseTab: () => void;
}) {
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
			className="fixed z-50 flex w-[196px] flex-col rounded-md border border-border-raised bg-raised p-unit"
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
			<button
				type="button"
				role="menuitem"
				className="flex h-[30px] items-center rounded-sm px-3 text-left text-text hover:bg-surface type-control"
				onClick={() => act(onExport)}
			>
				Export project…
			</button>
			<div className="mx-2 my-unit h-px bg-border-raised" />
			<button
				type="button"
				role="menuitem"
				className="flex h-[30px] items-center rounded-sm px-3 text-left text-text hover:bg-surface type-control"
				onClick={() => act(onCloseTab)}
			>
				Close tab
			</button>
		</div>,
		document.body,
	);
}
