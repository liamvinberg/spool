import { useEffect, useRef, useState } from "react";
import { Row } from "shared/ui/spool/properties-fields";

// The fixture's authored variables, not names guessed from matching pixels.
// Production menus come from the project's compiled theme.
const COLORS = [
	{ group: "Northbound", names: ["--color-forest", "--color-paper", "--color-ink", "--color-earth"] },
	{
		group: "Spool",
		names: [
			"--color-bg",
			"--color-surface",
			"--color-raised",
			"--color-text",
			"--color-muted",
			"--color-thread",
			"--color-border",
			"--color-on-thread",
		],
	},
];
function hex(value: string) {
	if (value === "rgba(0, 0, 0, 0)") return "transparent";
	const rgb = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(value);
	return rgb
		? `#${rgb
				.slice(1)
				.map((v) => Number(v).toString(16).padStart(2, "0"))
				.join("")}`.toUpperCase()
		: value;
}
export function ColorField({
	node,
	authored,
	name,
	value,
	onBegin,
	onChange,
	onApply,
	onFinish,
}: {
	node: HTMLElement;
	authored: string;
	name: string;
	value: string;
	onBegin: () => void;
	onChange: (v: string) => void;
	onApply: (v: string) => void;
	onFinish: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const host = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const binding = /^var\((--[\w-]+)\)$/.exec(authored)?.[1];
	const shown = hex(value);
	const valid = draft === null || CSS.supports(name, draft);
	useEffect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !host.current?.contains(event.target)) setOpen(false);
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !event.defaultPrevented) {
				setOpen(false);
				trigger.current?.focus();
			}
		};
		const scroll = (event: Event) => {
			if (!(event.target instanceof Node) || !host.current?.querySelector("fieldset")?.contains(event.target))
				setOpen(false);
		};
		document.addEventListener("scroll", scroll, true);
		window.addEventListener("resize", scroll);
		document.addEventListener("pointerdown", outside);
		window.addEventListener("keydown", key);
		return () => {
			document.removeEventListener("scroll", scroll, true);
			window.removeEventListener("resize", scroll);
			document.removeEventListener("pointerdown", outside);
			window.removeEventListener("keydown", key);
		};
	}, [open]);
	const theme = open ? getComputedStyle(node) : null;
	const anchor = open ? trigger.current?.getBoundingClientRect() : null;
	const rail = open ? host.current?.closest(".ep-rail")?.getBoundingClientRect() : null;
	const position =
		anchor && rail
			? { left: Math.max(8, rail.left - 272), top: Math.max(8, Math.min(anchor.top, window.innerHeight - 448)) }
			: undefined;
	return (
		<div className="ep-color-field" ref={host}>
			<Row name={name === "background-color" ? "background" : "color"}>
				<button
					type="button"
					ref={trigger}
					className="ep-color-trigger"
					aria-label={`Choose ${name}`}
					aria-expanded={open}
					title={
						binding
							? `Linked to ${binding}`
							: authored
								? "Custom value"
								: "Resolved from the page; source binding has not been inspected"
					}
					onClick={() => {
						setOpen((v) => !v);
						setSearch("");
					}}
				>
					<span className="ep-swatch" style={{ background: value }} />
					<span>{binding ? binding.replace(/^--(color-)?/, "") : shown}</span>
					<span className="ep-color-kind">{binding ? "↗" : authored ? "custom" : "page"}</span>
				</button>
			</Row>
			{open && (
				<fieldset className="ep-color-menu" style={position} aria-label={`${name} options`}>
					<input
						className="ep-token-search"
						aria-label={`Find ${name} token`}
						placeholder="Find a color token…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					{COLORS.map((group) => {
						const options = group.names.filter(
							(token) => token.includes(search.toLowerCase()) && theme?.getPropertyValue(token).trim(),
						);
						return (
							options.length > 0 && (
								<div className="ep-color-options" key={group.group}>
									<p>{group.group}</p>
									{options.map((token) => (
										<button
											type="button"
											key={token}
											aria-label={`Apply ${token}`}
											aria-pressed={binding === token}
											onClick={() => {
												onApply(`var(${token})`);
												setOpen(false);
												trigger.current?.focus();
											}}
										>
											<span className="ep-swatch" style={{ background: theme?.getPropertyValue(token) }} />
											<span>{token.replace(/^--(color-)?/, "")}</span>
											<span>{theme?.getPropertyValue(token).trim()}</span>
										</button>
									))}
								</div>
							)
						);
					})}
					<div className="ep-custom-color">
						{binding ? (
							<button type="button" className="ep-unlink" onClick={() => onApply(value)}>
								Use custom value
							</button>
						) : (
							<>
								<label>
									Custom value
									<input
										aria-label={name}
										aria-invalid={!valid}
										value={draft ?? shown}
										onFocus={onBegin}
										onChange={(e) => {
											setDraft(e.target.value);
											if (CSS.supports(name, e.target.value)) onChange(e.target.value);
										}}
										onBlur={() => {
											setDraft(null);
											onFinish();
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												e.currentTarget.blur();
											}
										}}
									/>
								</label>
								<input
									type="color"
									aria-label={`Pick custom ${name}`}
									value={/^#[0-9A-F]{6}$/i.test(draft ?? shown) ? (draft ?? shown).toLowerCase() : "#000000"}
									onFocus={onBegin}
									onChange={(e) => {
										setDraft(e.target.value);
										onChange(e.target.value);
									}}
									onBlur={() => {
										setDraft(null);
										onFinish();
									}}
								/>
								{!valid && (
									<span className="ep-color-error" role="status">
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
