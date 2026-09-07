import { type ReactNode, useEffect, useRef, useState } from "react";

export type ChoiceOption = { value: string; label?: string; detail?: string; disabled?: boolean };

// One menu treatment for property values, scope, and element actions.
// The prototype keeps every value and callback supplied by the reviewed editor.
export function Choice({
	label,
	value,
	options,
	onChange,
	placeholder,
	children,
	className = "",
	searchable = false,
}: {
	label: string;
	value: string;
	options: ChoiceOption[];
	onChange: (value: string) => void;
	placeholder?: string;
	children?: ReactNode;
	className?: string;
	searchable?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const shown = options.filter((option) =>
		`${option.label ?? option.value} ${option.detail ?? ""}`.toLowerCase().includes(query.toLowerCase()),
	);
	const dismiss = (restore = false) => {
		setOpen(false);
		if (restore) trigger.current?.focus({ preventScroll: true });
	};
	useEffect(() => {
		if (!open) return;
		const openedAt = trigger.current?.getBoundingClientRect();
		setQuery("");
		const id = requestAnimationFrame(() => {
			(
				menu.current?.querySelector<HTMLElement>(searchable ? "input" : '[aria-selected="true"]') ??
				menu.current?.querySelector<HTMLElement>("button:not(:disabled)")
			)?.focus({ preventScroll: true });
		});
		const outside = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!menu.current?.contains(event.target) &&
				!trigger.current?.contains(event.target)
			)
				dismiss();
		};
		const scroll = (event: Event) => {
			if (event.type === "resize") {
				dismiss();
				return;
			}
			if (event.target instanceof Node && menu.current?.contains(event.target)) return;
			const now = trigger.current?.getBoundingClientRect();
			if (!now || !openedAt || Math.abs(now.top - openedAt.top) > 0.5 || Math.abs(now.left - openedAt.left) > 0.5)
				dismiss();
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("scroll", scroll, true);
		window.addEventListener("resize", scroll);
		return () => {
			cancelAnimationFrame(id);
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("scroll", scroll, true);
			window.removeEventListener("resize", scroll);
		};
	}, [open, searchable]);
	const box = open ? trigger.current?.getBoundingClientRect() : null;
	return (
		<div className={className}>
			<button
				ref={trigger}
				type="button"
				className="ei-choice"
				aria-label={label}
				aria-expanded={open}
				aria-haspopup="listbox"
				onClick={() => setOpen(!open)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setOpen(true);
					}
				}}
			>
				{children ?? (
					<>
						<span>{options.find((option) => option.value === value)?.label ?? (value || placeholder)}</span>
						<span className="ei-chevron">⌄</span>
					</>
				)}
			</button>
			{open && box && (
				<div
					ref={menu}
					className="ei-menu"
					style={{
						position: "fixed",
						left: Math.max(8, Math.min(box.left - 248, window.innerWidth - 264)),
						top: Math.max(
							8,
							Math.min(
								box.top,
								window.innerHeight - Math.min(352, options.length * 30 + (searchable ? 50 : 14)),
							),
						),
					}}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.key === "Escape") {
							event.preventDefault();
							dismiss(true);
						}
						if (
							["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
							!(event.target instanceof HTMLInputElement && ["Home", "End"].includes(event.key))
						) {
							event.preventDefault();
							const buttons = [
								...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
							];
							const index = buttons.findIndex((button) => button === document.activeElement);
							const next =
								event.key === "Home"
									? 0
									: event.key === "End"
										? buttons.length - 1
										: (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
							buttons[next]?.focus({ preventScroll: true });
							buttons[next]?.scrollIntoView({ block: "nearest" });
						}
					}}
					onBlur={(event) => {
						if (
							event.relatedTarget instanceof Node &&
							!event.currentTarget.contains(event.relatedTarget) &&
							event.relatedTarget !== trigger.current
						)
							dismiss();
					}}
				>
					{searchable && (
						<input
							className="ep-token-search"
							aria-label={`Find ${label.toLowerCase()}`}
							placeholder="Find a property…"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
					)}
					<div className="ei-menu-options" role="listbox" aria-label={`${label} options`}>
						{shown.map((option) => (
							<button
								key={option.value}
								type="button"
								role="option"
								disabled={option.disabled}
								aria-selected={option.value === value}
								onClick={() => {
									onChange(option.value);
									dismiss(true);
								}}
							>
								<span>{option.label ?? option.value}</span>
								<span>{option.detail}</span>
								<span className="ei-check">{option.value === value ? "✓" : ""}</span>
							</button>
						))}
						{!shown.length && <p>No matching properties.</p>}
					</div>
				</div>
			)}
		</div>
	);
}
