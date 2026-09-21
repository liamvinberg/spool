import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { ThemeToken } from "../../daemon/theme";
import { Row } from "./properties-fields";
import type { PropertyReading } from "./property-controls";

export type ColorOption = ThemeToken & { reference: string | null };

export type ColorChoice = { kind: "binding"; name: string } | { kind: "custom"; value: string } | { kind: "remove" };

function colorText(value: string): string {
	if (value === "rgba(0, 0, 0, 0)") return "transparent";
	const rgb = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(value);
	return rgb
		? `#${rgb
				.slice(1)
				.map((part) => Number(part).toString(16).padStart(2, "0"))
				.join("")}`.toUpperCase()
		: value;
}
function tokenKeys(event: KeyboardEvent<HTMLElement>): void {
	if (event.key === "Enter" || event.key === " ") {
		event.stopPropagation();
		return;
	}
	if (event.target instanceof HTMLInputElement && !event.target.classList.contains("ep-token-search")) return;
	if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
	if (event.target instanceof HTMLInputElement && ["Home", "End"].includes(event.key)) return;
	event.preventDefault();
	event.stopPropagation();
	const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".ep-color-options button")];
	const focused = document.activeElement;
	const index = focused instanceof HTMLButtonElement ? options.indexOf(focused) : -1;
	const next =
		event.key === "Home"
			? 0
			: event.key === "End"
				? options.length - 1
				: (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length;
	options[next]?.focus({ preventScroll: true });
	options[next]?.scrollIntoView({ block: "nearest" });
}

/** The colour menu: the reference the value names, the value it comes to, and the tokens under it. */
export function PropertyColorField({
	property,
	reading,
	ok,
	reason,
	options,
	begin,
	preview,
	apply,
	finish,
	accessory,
}: {
	property: "color" | "background-color";
	reading: PropertyReading | undefined;
	/** whether a gesture on this field goes anywhere; a reading alone draws it */
	ok: boolean;
	reason?: string | undefined;
	options: readonly ColorOption[];
	begin(): void;
	preview(value: string): void;
	apply(choice: ColorChoice): void;
	finish(commit: boolean): void;
	accessory?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const host = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const editing = useRef(false);
	const binding = reading?.binding.kind === "reference" ? reading.binding.name : undefined;
	const resolved = reading?.mixed === true ? "" : (reading?.native ?? "");
	const shown = reading?.mixed === true ? "Mixed" : colorText(resolved);
	const valid = draft === null || CSS.supports(property, draft);
	const validDraft = useRef(valid);
	validDraft.current = valid;
	const finishRef = useRef(finish);
	finishRef.current = finish;
	const complete = (commit: boolean) => {
		if (!editing.current) return;
		editing.current = false;
		finishRef.current(commit);
		setDraft(null);
	};
	useEffect(
		() => () => {
			if (editing.current) finishRef.current(false);
		},
		[],
	);
	useEffect(() => {
		if (!open) return;
		const openedAt = trigger.current?.getBoundingClientRect();
		const focus = requestAnimationFrame(() =>
			host.current?.querySelector<HTMLInputElement>(".ep-token-search")?.focus({ preventScroll: true }),
		);
		const close = (commit = false) => {
			if (editing.current) {
				editing.current = false;
				finishRef.current(commit && validDraft.current);
			}
			setDraft(null);
			setOpen(false);
		};
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !host.current?.contains(event.target)) close(true);
		};
		const key = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				close();
				trigger.current?.focus();
			}
		};
		const scroll = (event: Event) => {
			if (event.type === "resize") {
				close();
				return;
			}
			if (event.target instanceof Node && host.current?.querySelector("fieldset")?.contains(event.target)) return;
			const now = trigger.current?.getBoundingClientRect();
			if (!now || !openedAt || Math.abs(now.top - openedAt.top) > 0.5 || Math.abs(now.left - openedAt.left) > 0.5)
				close();
		};
		document.addEventListener("scroll", scroll, true);
		window.addEventListener("resize", scroll);
		document.addEventListener("pointerdown", outside);
		window.addEventListener("keydown", key);
		return () => {
			cancelAnimationFrame(focus);
			document.removeEventListener("scroll", scroll, true);
			window.removeEventListener("resize", scroll);
			document.removeEventListener("pointerdown", outside);
			window.removeEventListener("keydown", key);
		};
	}, [open]);
	const anchor = open ? trigger.current?.getBoundingClientRect() : null;
	const rail = open ? host.current?.closest("[data-properties-rail]")?.getBoundingClientRect() : null;
	const position = anchor
		? {
				left: Math.max(8, (rail?.left ?? anchor.left) - 272),
				top: Math.max(8, Math.min(anchor.top, innerHeight - 448)),
			}
		: undefined;
	const choose = (choice: ColorChoice) => {
		complete(false);
		apply(choice);
		setOpen(false);
		trigger.current?.focus();
	};
	const start = () => {
		if (!editing.current) {
			editing.current = true;
			begin();
		}
	};
	return (
		<div className="ep-color-field" ref={host}>
			<Row name={property === "background-color" ? "background" : "color"} ok={ok && reading !== undefined}>
				<button
					type="button"
					ref={trigger}
					className="ep-color-trigger flex items-center gap-[6px] w-full min-w-0 py-[3px] px-[4px] [font:11px_var(--font-mono)] text-left rounded-[4px] [&:hover]:bg-surface"
					aria-label={`Choose ${property}`}
					aria-expanded={open}
					disabled={!ok || !reading}
					title={
						binding
							? `Linked to ${binding}`
							: reading?.binding.kind === "custom"
								? "Custom value"
								: reading
									? "Nothing sets this colour"
									: (reason ?? "This colour cannot be written here")
					}
					onClick={() => {
						complete(false);
						setOpen(!open);
						setSearch("");
					}}
				>
					<span className="ep-swatch size-[10px] shrink-0 border border-[#777]" style={{ background: resolved }} />
					<span className="truncate">{binding ? binding.replace(/^--(color-)?/, "") : shown || "…"}</span>
					<span className="ep-color-kind ml-auto text-muted text-[9px]">
						{binding ? "↗" : (reading?.binding.kind ?? "")}
					</span>
				</button>
				{accessory}
			</Row>
			{open && (
				<fieldset
					className="ep-color-menu fixed z-[60] w-[256px] min-w-0 max-h-[min(432px,calc(100dvh-16px))] overflow-auto overscroll-contain m-0 bg-bg rounded-[6px] border border-border-raised p-[6px] text-text animate-menu-in origin-top-right motion-reduce:animate-none"
					style={position}
					aria-label={`${property} options`}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							complete(false);
							setOpen(false);
							trigger.current?.focus();
						} else tokenKeys(event);
					}}
				>
					<div className="ei-color-heading flex justify-between pt-[6px] px-[6px] pb-[9px] text-[12px]">
						<span>{property === "background-color" ? "Background" : "Color"}</span>
						<span className="text-muted [font:var(--type-detail)]">{shown}</span>
					</div>
					<input
						className="ep-token-search w-full py-[8px] px-[6px] mb-[6px] border-0 border-b border-border rounded-none bg-transparent [font:var(--type-value)]"
						aria-label={`Find ${property} token`}
						placeholder="Find a color token…"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
					{(["project", "default"] as const).map((group) => {
						const matches = options.filter(
							(option) => option.from === group && option.name.toLowerCase().includes(search.toLowerCase()),
						);
						return (
							matches.length > 0 && (
								<div className="ep-color-options mt-[2px]" key={group}>
									<p className="mt-0 mx-0 mb-[4px] p-[6px] text-[11px] text-muted">
										{group === "project" ? "Project" : "Default"}
									</p>
									{matches.map((option) => (
										<button
											type="button"
											key={option.name}
											className="flex items-center gap-[8px] w-full min-h-[30px] p-[6px] rounded-[3px] text-left [font:var(--type-detail)] [&:hover]:bg-surface [&:hover]:outline-offset-[-1px] focus-visible:bg-surface focus-visible:outline-offset-[-1px] aria-pressed:bg-surface"
											aria-label={`Apply ${option.reference ?? option.name}`}
											aria-pressed={option.reference !== null && binding === option.reference}
											onClick={() => choose({ kind: "binding", name: option.name })}
										>
											<span
												className="ep-swatch size-[10px] shrink-0 border border-[#777]"
												style={{ background: option.value }}
											/>
											<span>{option.name}</span>
											<span className="ml-auto text-muted text-[10px]">{option.value}</span>
										</button>
									))}
								</div>
							)
						);
					})}
					{reading?.tokens.length ? (
						<div className="ep-color-options mt-[2px]">
							<button
								type="button"
								className="flex items-center gap-[8px] w-full min-h-[30px] p-[6px] rounded-[3px] text-left [font:var(--type-detail)] [&:hover]:bg-surface [&:hover]:outline-offset-[-1px] focus-visible:bg-surface focus-visible:outline-offset-[-1px] aria-pressed:bg-surface"
								onClick={() => choose({ kind: "remove" })}
							>
								{property === "color" ? "Remove color" : "Remove background color"}
							</button>
						</div>
					) : null}
					<div className="ep-custom-color flex gap-[8px] flex-wrap items-end border-t border-border mt-[6px] mx-0 mb-0 pt-[9px] px-[6px] pb-[4px]">
						{binding ? (
							<button
								type="button"
								className="ep-unlink py-[4px] px-0 text-[11px] w-full text-left"
								onClick={() => choose({ kind: "custom", value: resolved })}
							>
								Use custom value
							</button>
						) : (
							<>
								<label className="flex-1 min-w-0 text-[11px] text-muted">
									Custom value
									<input
										className="block w-full p-[5px] mt-[5px] border border-border text-text [font:11px_var(--font-mono)] bg-transparent"
										aria-label={property}
										aria-invalid={!valid}
										value={draft ?? shown}
										onFocus={start}
										onChange={(event) => {
											setDraft(event.target.value);
											if (CSS.supports(property, event.target.value)) preview(event.target.value);
										}}
										onBlur={() => complete(valid)}
										onKeyDown={(event) => {
											if (event.key === "Escape") {
												complete(false);
												event.currentTarget.blur();
											}
											if (event.key === "Enter") {
												event.preventDefault();
												complete(valid);
												event.currentTarget.blur();
											}
										}}
									/>
								</label>
								<input
									type="color"
									className="size-[28px] p-0 border-0 [background:none]"
									aria-label={`Pick custom ${property}`}
									value={/^#[0-9A-F]{6}$/i.test(draft ?? shown) ? (draft ?? shown).toLowerCase() : "#000000"}
									onFocus={start}
									onChange={(event) => {
										setDraft(event.target.value);
										preview(event.target.value);
									}}
									onBlur={() => complete(true)}
								/>
								{!valid && (
									<span className="ep-color-error text-thread text-[11px]" role="status">
										Enter a valid CSS color.
									</span>
								)}
							</>
						)}
					</div>
				</fieldset>
			)}
		</div>
	);
}
