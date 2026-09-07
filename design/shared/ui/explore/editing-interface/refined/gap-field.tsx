import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Row } from "./fields";
import { type GapProperty } from "../reference/frames/editing/gap";
import type { GapAnchor } from "../reference/frames/editing/gap-overlay";
import { spacingChoices } from "./spacing-choices";
import { tokenKeys } from "./token-keys";
import { gapValue } from "../reference/frames/everyday/spacing";

export function GapField({
	node,
	declaration,
	property,
	value,
	anchor,
	onOpen,
	onClose,
	onBegin,
	onChange,
	onFinish,
	onCancel,
	cancelled,
	revision,
}: {
	node: HTMLElement;
	declaration: string;
	property: GapProperty;
	value: number;
	anchor: GapAnchor | null;
	onOpen: (anchor: GapAnchor) => void;
	onClose: () => void;
	onBegin: () => void;
	onChange: (value: string) => void;
	onFinish: () => void;
	onCancel: () => void;
	cancelled: RefObject<boolean>;
	revision: number;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const host = useRef<HTMLFieldSetElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const hold = useRef(false);
	const current = useRef(value);
	if (!hold.current) current.current = value;
	const binding = declaration && !/^\d*\.?\d+px$/.test(declaration) && declaration !== "normal" ? declaration : null;
	const open = anchor?.node === node;
	const choices = useMemo(() => (open ? spacingChoices(node) : []), [node, open]);
	const scrub = useRef({ binding, choices });
	const live = useRef({ onClose, onFinish });
	live.current = { onClose, onFinish };
	const close = () => {
		onFinish();
		onClose();
		(anchor?.element.isConnected ? anchor.element : trigger.current)?.focus({ preventScroll: true });
	};
	useEffect(() => {
		if (!open) return;
		setSearch("");
		setDraft(null);
		const focus = requestAnimationFrame(() => {
			const target = input.current ?? host.current?.querySelector<HTMLInputElement>(".ep-token-search");
			target?.focus({ preventScroll: true });
			target?.select();
		});
		const dismiss = () => {
			live.current.onFinish();
			live.current.onClose();
		};
		const outside = (e: PointerEvent) => {
			if (
				e.target instanceof Node &&
				!host.current?.contains(e.target) &&
				!trigger.current?.contains(e.target) &&
				!(e.target instanceof Element && e.target.closest(".ep-gap-band"))
			)
				dismiss();
		};
		const scroll = (e: Event) => {
			if (e.target instanceof Node && host.current?.contains(e.target)) return;
			const now = anchor?.element.getBoundingClientRect();
			if (!now || !anchor || Math.abs(now.top - anchor.rect.top) > 0.5 || Math.abs(now.left - anchor.rect.left) > 0.5)
				dismiss();
		};
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				dismiss();
				trigger.current?.focus({ preventScroll: true });
			}
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("scroll", scroll, true);
		window.addEventListener("resize", dismiss);
		window.addEventListener("keydown", key);
		return () => {
			cancelAnimationFrame(focus);
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("scroll", scroll, true);
			window.removeEventListener("resize", dismiss);
			window.removeEventListener("keydown", key);
		};
	}, [open]);
	useEffect(() => {
		if (cancelled.current && open) onClose();
	}, [revision, cancelled, open, onClose]);
	const shown = binding
		? (choices.find((item) => item.css === binding)?.name ??
			binding.replace(/^calc\(var\(--spacing\) \* ([\d.]+)\)$/, "spacing-$1").replace(/^var\(--|\)$/g, ""))
		: `${value}`;
	const numeric = Number(draft);
	const valid = draft === null || (draft.trim() !== "" && Number.isFinite(numeric) && numeric >= 0);
	return (
		<div className="ep-gap-field">
			<Row
				name="gap"
				onScrub={(units, shift) => {
					if (!hold.current) {
						onBegin();
						hold.current = true;
						scrub.current = { binding, choices: binding ? spacingChoices(node) : [] };
					}
					if (!cancelled.current) {
						current.current = Math.max(0, current.current + units * (shift ? 10 : 1));
						onChange(gapValue(current.current, scrub.current.binding, scrub.current.choices));
					}
				}}
				onScrubEnd={(aborted) => {
					hold.current = false;
					if (aborted) onCancel();
					else onFinish();
				}}
			>
				<button
					type="button"
					ref={trigger}
					className="ep-color-trigger ep-gap-trigger"
					aria-label="Choose gap"
					aria-expanded={open}
					title={`${property} · ${binding ? `Linked: ${binding}` : declaration ? "Custom value" : "Resolved from page"}`}
					onClick={(e) => {
						if (open) close();
						else {
							cancelled.current = false;
							onOpen({ element: e.currentTarget, rect: e.currentTarget.getBoundingClientRect(), node });
						}
					}}
				>
					<span>{shown}</span>
					<span className="ep-color-kind">{binding ? "↗" : "px"}</span>
				</button>
			</Row>
			{open && anchor && (
				<fieldset
					ref={host}
					className="ep-color-menu ep-gap-menu"
					aria-label="Gap options"
					onKeyDown={tokenKeys}
					style={{
						left: Math.max(
							8,
							Math.min(anchor.rect.left - (anchor.element === trigger.current ? 270 : 0), window.innerWidth - 272),
						),
						top: Math.max(8, Math.min(anchor.rect.bottom + 8, window.innerHeight - 448)),
					}}
				>
					<div
						className="ep-gap-heading"
						title="Equal-size token names stay distinct. If stepping cannot choose one name, use the picker."
					>
						<span>Gap</span>
						<span>{value}px</span>
					</div>
					<input
						className="ep-token-search"
						aria-label="Find spacing token"
						placeholder="Find a spacing token…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					<div className="ep-color-options">
						{choices
							.filter((item) => item.name.includes(search.toLowerCase()))
							.map((item) => (
								<button
									type="button"
									key={item.name}
									title={`${item.css} = ${item.px}px`}
									aria-label={`Apply ${item.name}`}
									aria-pressed={binding === item.css}
									onClick={() => {
										onBegin();
										onChange(item.css);
										close();
									}}
								>
									<span className="ep-spacing-mark" />
									<span>{item.name}</span>
									<span>{item.px}px</span>
								</button>
							))}
						{choices.filter((item) => item.name.includes(search.toLowerCase())).length === 0 && (
							<p>No matching spacing tokens.</p>
						)}
					</div>
					<div className="ep-custom-color ep-gap-custom">
						{binding ? (
							<button
								type="button"
								className="ep-unlink"
								onClick={() => {
									onBegin();
									onChange(`${value}px`);
									onFinish();
									requestAnimationFrame(() => {
										input.current?.focus();
										input.current?.select();
									});
								}}
							>
								Use custom value
							</button>
						) : (
							<label>
								Custom value
								<input
									ref={input}
									aria-label="Gap pixels"
									inputMode="decimal"
									role="spinbutton"
									aria-valuenow={value}
									aria-valuemin={0}
									aria-invalid={!valid}
									value={draft ?? value}
									onChange={(e) => {
										onBegin();
										setDraft(e.target.value);
										const n = Number(e.target.value);
										if (e.target.value.trim() && Number.isFinite(n) && n >= 0) onChange(`${n}px`);
									}}
									onBlur={() => {
										setDraft(null);
										onFinish();
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" && valid) {
											e.preventDefault();
											close();
										}
										if (e.key === "ArrowUp" || e.key === "ArrowDown") {
											e.preventDefault();
											onBegin();
											setDraft(null);
											onChange(`${Math.max(0, value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1))}px`);
										}
									}}
								/>
							</label>
						)}
						{!valid && (
							<span className="ep-color-error" role="status">
								Enter zero or a positive number.
							</span>
						)}
					</div>
				</fieldset>
			)}
		</div>
	);
}
