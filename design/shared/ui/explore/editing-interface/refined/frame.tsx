import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import {
	BOX,
	Row,
	Section,
	VALUE,
} from "shared/ui/explore/editing-interface/reference/shared/ui/spool/properties-fields";
import { gapProperty } from "../reference/frames/editing/gap";
import { Selection } from "../reference/frames/editing/selection";
import { useViewport } from "../reference/frames/editing/viewport";
import { ColorField } from "./color-field";
import { GapField } from "./gap-field";
import { type GapAnchor, GapOverlay } from "../reference/frames/everyday/gap-overlay";
import "../reference/frames/editing/playground.css";

import { Demo, imageA, imageB } from "../reference/frames/everyday/demo";
import { move, type Snapshot, same, snapshot, type Transaction } from "../reference/frames/everyday/history";
import "../reference/frames/everyday/everyday.css";
import { Choice } from "./choice";
import "./interface.css";

// Integration presentation over a fixed React project. All writes, source
// identities, scope declarations and save outcomes are explicitly simulated.
export type Fault =
	| "none"
	| "independent"
	| "conflict"
	| "lost"
	| "mismatch"
	| "loading"
	| "render-failure"
	| "rollback"
	| "rollback-blocked"
	| "connection";
type Notice = {
	title: string;
	detail: string;
	attention?: boolean;
	recovery?: "retry" | "reload" | "render" | "rollback" | "unknown";
};
const faultNames: Record<Fault, string> = {
	none: "Normal automatic save",
	independent: "Agent changes another property",
	conflict: "Agent changes the same property",
	lost: "Selected source disappears",
	mismatch: "Saved, but one use stays unchanged",
	loading: "Saved, application is loading",
	"render-failure": "Saved, application fails to render",
	rollback: "Verification fails, rollback succeeds",
	"rollback-blocked": "Verification fails, rollback is blocked",
	connection: "Connection lost after saving",
};
const GROUPS = "[data-preview]";
const NUMBERS = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
const OPTIONAL = [
	"gap",
	"letter-spacing",
	"border-width",
	"min-height",
	"max-width",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
];
function literal(node: HTMLElement): HTMLElement | null {
	if (node.dataset.expression) return null;
	if (node.dataset.literal !== undefined) return node;
	return node.querySelector<HTMLElement>(":scope > [data-literal]");
}
function name(node: HTMLElement) {
	if (node.dataset.name) return node.dataset.name;
	if (node.classList.contains("sg-page")) return "Page";
	if (node.classList.contains("sg-hero")) return "Hero";
	if (node.dataset.shared) return "Download button";
	if (node.matches(GROUPS)) return "Demo preview";
	if (node.id) return node.id === "follow-heading" ? "h2" : node.id;
	return node.tagName.toLowerCase();
}
export default function EditingInterface({
	initial = "none",
	treatment = "inline",
	state = "idle",
}: {
	initial?: Fault;
	treatment?: "inline" | "line";
	state?: "idle" | "uses" | "tokens";
}) {
	const root = useRef<HTMLDivElement>(null);
	const stage = useRef<HTMLDivElement>(null);
	const viewport = useViewport(stage, root);
	const keyboard = useRef<(event: KeyboardEvent) => void>(() => {});
	const keyGesture = useRef(false);
	const [selected, setSelected] = useState<HTMLElement | null>(null);
	const [revision, setRevision] = useState(0);
	const [reach, setReach] = useState(false);
	const [affected, setAffected] = useState<string | null>(null);
	const feedbackTimer = useRef<number | undefined>(undefined);
	const [hoverUse, setHoverUse] = useState<HTMLElement | null>(null);
	const [uses, setUses] = useState(state === "uses");
	const [hint, setHint] = useState(
		"Select anything. Double-click text to edit. Option + hover measures spacing. Shift 2 zooms to selection. Space pans.",
	);
	const [hovered, setHovered] = useState<HTMLElement | null>(null);
	const [measuring, setMeasuring] = useState(false);
	const [gapAnchor, setGapAnchor] = useState<GapAnchor | null>(null);
	const [padding, setPadding] = useState<string | null>(null);
	const paint = useRef<number | null>(null);
	const pointer = useRef<{ x: number; y: number } | null>(null);
	const past = useRef<Transaction[]>([]);
	const future = useRef<Transaction[]>([]);
	const pending = useRef<Transaction | null>(null);
	const cancelled = useRef(false);
	const inline = useRef<HTMLElement | null>(null);
	const active = useRef<HTMLElement | null>(null);
	const [scope, setScope] = useState("base");
	const [openedScopes, setOpenedScopes] = useState(["base", "md", "hover"]);
	const [notice, setNotice] = useState<Notice>({
		title: "Ready to edit",
		detail: "Changes preview immediately and save when you finish.",
	});
	const [firstUse, setFirstUse] = useState(false);
	const [faultName, setFaultName] = useState<Fault>(initial);
	const fault = useRef<Fault>(initial);
	const [request, setRequest] = useState<string | null>(null);
	const retained = useRef<{ transaction: Transaction; after: Snapshot; intent: string } | null>(null);
	const unrendered = useRef<Transaction | null>(null);
	const saveGeneration = useRef(0);
	const [frameWidth, setFrameWidth] = useState(480);
	const projected = useRef<HTMLStyleElement | null>(null);
	const initialApplied = useRef(false);
	const scopedStyle = (node: HTMLElement) => {
		const result = document.createElement("div").style;
		result.cssText = node.getAttribute(`data-${scope}-style`) ?? "";
		return result;
	};
	const projectScopes = () => {
		if (!root.current || !projected.current) return;
		projected.current.textContent = [...root.current.querySelectorAll<HTMLElement>("[data-edit-node]")]
			.flatMap((node) => {
				const selector = `[data-edit-node="${node.dataset.editNode}"]`;
				return [
					node.dataset.mdStyle
						? `@container frame (min-width: 768px) { ${selector} { ${node.dataset.mdStyle} } }`
						: "",
					node.dataset.hoverStyle ? `${selector}:hover { ${node.dataset.hoverStyle} }` : "",
				];
			})
			.join("\n");
	};
	const intentOf = (before: Snapshot, after: Snapshot, label: string) => {
		for (const a of before) {
			const b = after.find((entry) => entry.node === a.node);
			if (!b) continue;
			if (a.html !== b.html) return `${label}: ${b.node.textContent ?? ""}`;
			if (a.style !== b.style) return `${label}: ${b.node.style.getPropertyValue(label) || b.style}`;
			if (a.parent !== b.parent) return `${label}: ${name(a.node)}`;
			if (JSON.stringify(a.attributes) !== JSON.stringify(b.attributes)) return `${label} in ${scope}`;
		}
		return label;
	};
	const askAgent = () => {
		setRequest(
			`Please help with ${retained.current?.intent ?? name(active.current ?? document.body)}. ${notice.detail} Source context: ${active.current?.dataset.owner ?? active.current?.closest<HTMLElement>("[data-owner]")?.dataset.owner ?? "target needs fresh identification"}.`,
		);
	};

	const refresh = () => {
		projectScopes();
		if (paint.current !== null) return;
		paint.current = requestAnimationFrame(() => {
			paint.current = null;
			setRevision((v) => v + 1);
		});
	};
	useLayoutEffect(() => {
		void viewport.width;
		void viewport.zoom;
		// Read the rail after React applies the page's new viewport geometry.
		setRevision((v) => v + 1);
	}, [viewport.width, viewport.zoom]);
	const begin = (label: string) => {
		window.clearTimeout(feedbackTimer.current);
		const owner = active.current?.dataset.shared;
		const local =
			label === "text"
				? owner !== "button-part"
				: ["keyboard move", "image", "alt"].includes(label) || (label === "delete" && owner !== "button-part");
		setAffected(owner && !local ? owner : null);
		if (!pending.current && root.current) {
			pending.current = { before: snapshot(root.current), label };
			saveGeneration.current++;
			setNotice({ title: "Editing", detail: "Live preview · Escape cancels this edit." });
		}
	};

	const finish = () => {
		const transaction = pending.current;
		pending.current = null;
		if (!transaction || !root.current) {
			refresh();
			return;
		}
		const after = snapshot(root.current);
		if (same(transaction.before, after)) {
			setAffected(null);
			setNotice({ title: "No change", detail: "The source value is unchanged." });
			refresh();
			return;
		}
		feedbackTimer.current = window.setTimeout(() => setAffected(null), 450);
		transaction.after = after;
		const intent = intentOf(transaction.before, after, transaction.label);
		const outcome = fault.current;
		fault.current = "none";
		setFaultName("none");
		const hold = () => {
			retained.current = { transaction, after, intent };
		};
		if (outcome === "conflict" || outcome === "lost") {
			move(after, transaction.before, false);
			hold();
			if (outcome === "lost") {
				active.current?.remove();
				setSelected(null);
				active.current = null;
				setNotice({
					title: "The selected source is gone",
					detail: `Your edit is kept: ${intent}. Select a valid target before retrying.`,
					attention: true,
					recovery: "retry",
				});
			} else {
				for (const node of targets()) {
					if (transaction.label === "text") {
						const text = literal(node);
						if (text) text.textContent = "Updated by the agent";
					} else
						node.style.setProperty(
							transaction.label === "resize" ? "width" : transaction.label,
							["color", "background-color"].includes(transaction.label) ? "#6a467a" : "32px",
							"important",
						);
				}
				setNotice({
					title: "Another edit changed this property",
					detail: `Showing the current value. Your edit is kept: ${intent}.`,
					attention: true,
					recovery: "retry",
				});
			}
			refresh();
			return;
		}
		past.current.push(transaction);
		future.current = [];
		if (outcome === "independent") {
			for (const node of targets())
				node.style.setProperty(
					transaction.label === "margin-top" ? "margin-bottom" : "margin-top",
					"24px",
					"important",
				);
		}
		if (outcome === "connection") {
			hold();
			past.current.pop();
			setNotice({
				title: "Save outcome unknown",
				detail: `The connection ended before the save was confirmed. Your edit is kept: ${intent}. Check current source before trying again.`,
				attention: true,
				recovery: "unknown",
			});
		} else if (["mismatch", "loading", "render-failure"].includes(outcome)) {
			hold();
			unrendered.current = transaction;
			// One use stays at the previous output; other uses can succeed.
			const held = after.filter((entry) => entry.node.closest("[data-frame-shell=confirmation]"));
			const previous = transaction.before.filter((entry) => entry.node.closest("[data-frame-shell=confirmation]"));
			move(held, previous, false);
			const frame = root.current.querySelector<HTMLElement>("[data-frame-shell=confirmation]");
			if (outcome !== "mismatch")
				frame?.setAttribute(
					"data-render-state",
					outcome === "loading" ? "Loading…" : "The application could not render.",
				);
			setNotice({
				title:
					outcome === "mismatch"
						? "Saved, but not visibly applied"
						: outcome === "loading"
							? "Saved · rendering pending"
							: "Saved · render failed",
				detail: `confirmation has ${outcome === "mismatch" ? "kept its previous output" : outcome === "loading" ? "not finished rendering" : "failed to render"}. Your edit: ${intent}.`,
				attention: true,
				recovery: outcome === "loading" ? "render" : "reload",
			});
		} else if (outcome === "rollback" || outcome === "rollback-blocked") {
			hold();
			if (outcome === "rollback") {
				move(after, transaction.before);
				past.current.pop();
				setNotice({
					title: "Verification failed · change rolled back",
					detail: `The saved output did not match the preview. The guarded rollback succeeded. Your edit is kept: ${intent}.`,
					attention: true,
					recovery: "retry",
				});
			} else {
				for (const node of targets()) node.style.setProperty(transaction.label, "40px", "important");
				setNotice({
					title: "Saved · rollback blocked",
					detail: `Another edit now owns this property. The saved change cannot safely be undone. Your requested input is kept: ${intent}.`,
					attention: true,
					recovery: "rollback",
				});
			}
		} else {
			retained.current = null;
			const generation = ++saveGeneration.current;
			setNotice({ title: "Saving…", detail: "The preview stays in place while the matching result takes over." });
			window.setTimeout(() => {
				if (generation !== saveGeneration.current) return;
				setNotice({
					title: "Saved",
					detail:
						outcome === "independent"
							? "The agent’s independent 24px margin remains. Undo changes only your edit."
							: transaction.label === "delete"
								? "The authored element was removed. Any default content remains. Undo restores the supplied element."
								: "The matching result is visible in the affected uses.",
				});
			}, 400);
		}
		refresh();
	};
	const cancel = () => {
		window.clearTimeout(feedbackTimer.current);
		setAffected(null);
		setReach(false);
		cancelled.current = true;
		saveGeneration.current++;
		setNotice({ title: "Edit cancelled", detail: "The previous value is restored. There is no new undo entry." });
		if (document.pointerLockElement) document.exitPointerLock();
		keyGesture.current = false;
		if (pending.current && root.current) move(snapshot(root.current), pending.current.before, false);
		pending.current = null;
		const editing = inline.current;
		inline.current = null;
		if (editing) {
			editing.contentEditable = "false";
			editing.blur();
		}
		refresh();
	};
	const stopInline = () => {
		keyGesture.current = false;
		const editing = inline.current;
		inline.current = null;
		if (editing) editing.contentEditable = "false";
		finish();
	};
	const choose = (node: HTMLElement, reveal = false) => {
		stopInline();
		window.clearTimeout(feedbackTimer.current);
		setAffected(null);
		setGapAnchor(null);
		setScope("base");
		active.current = node;
		setSelected(node);
		const box = node.getBoundingClientRect();
		setHint(
			Math.min(box.width, box.height) < 24
				? "Small selection · Shift 2 zooms in to reveal resize handles"
				: "Arrows follow layout · Cmd/Ctrl + arrows resize · Shift 2 zooms to selection",
		);
		setHovered(null);
		setPadding(null);
		setUses(false);
		setReach(false);
		stage.current?.focus({ preventScroll: true });
		if (reveal) node.scrollIntoView({ block: "center", behavior: "instant" });
	};

	const history = (redo: boolean) => {
		stopInline();
		saveGeneration.current++;
		const from = redo ? future : past,
			into = redo ? past : future;
		const item = from.current.at(-1);
		if (!item?.after) return;
		if (unrendered.current?.after) {
			move(unrendered.current.before, unrendered.current.after, false);
			unrendered.current = null;
			for (const frame of root.current?.querySelectorAll("[data-render-state]") ?? [])
				frame.removeAttribute("data-render-state");
		}
		if (!move(redo ? item.before : item.after, redo ? item.after : item.before)) {
			setNotice({
				title: `${redo ? "Redo" : "Undo"} unavailable`,
				detail:
					"A later edit changed the same value. This undo entry is kept; another action will not be undone instead.",
				attention: true,
			});
			refresh();
			return;
		}
		from.current.pop();
		into.current.push(item);
		setNotice({
			title: redo ? "Redone" : "Undone",
			detail: `${item.label} · independent changes remain. Undo changes the edit, not the application’s own state.`,
		});
		refresh();
	};
	const sharedKey = selected?.dataset.shared;
	const shared = Boolean(sharedKey);
	const targets = () =>
		sharedKey
			? [...(root.current?.querySelectorAll<HTMLElement>(`[data-shared="${sharedKey}"]`) ?? [])]
			: selected
				? [selected]
				: [];
	const css = (property: string, value: string) => {
		if (cancelled.current) return;
		begin(property);
		for (const node of targets()) {
			if (scope === "base") node.style.setProperty(property, value);
			else {
				const style = scopedStyle(node);
				style.setProperty(property, value, "important");
				node.setAttribute(`data-${scope}-style`, style.cssText);
			}
		}
		refresh();
	};
	const restoreProperty = (property: string) => {
		if (cancelled.current) return;
		for (const node of targets()) {
			const saved = pending.current?.before.find((entry) => entry.node === node);
			if (!saved) continue;
			const style = document.createElement("div").style;
			style.cssText = saved.style;
			node.style.setProperty(property, style.getPropertyValue(property), style.getPropertyPriority(property));
		}
		refresh();
	};
	const localCss = (property: string, value: string) => {
		if (cancelled.current || !selected) return;
		begin(property);
		setAffected(null);
		selected.style.setProperty(property, value, "important");
		refresh();
	};
	const apply = (property: string, value: string) => {
		cancelled.current = false;
		css(property, value);
		finish();
	};

	const removeSelected = () => {
		if (!selected || !root.current?.contains(selected)) return;
		stopInline();
		const parent = selected.parentElement;
		cancelled.current = false;
		begin("delete");
		if (selected.dataset.shared === "button-part") for (const node of targets()) node.remove();
		else selected.remove();
		finish();
		setSelected(parent?.closest<HTMLElement>("[data-edit-node]") ?? null);
		active.current = parent?.closest<HTMLElement>("[data-edit-node]") ?? null;
	};
	const swapImage = async (src: string) => {
		const node = selected;
		if (!(node instanceof HTMLImageElement)) return;
		const probe = new Image();
		probe.src = src;
		try {
			await probe.decode();
		} catch {
			setNotice({
				title: "Image could not be opened",
				detail: "Choose another image. Nothing changed.",
				attention: true,
			});
			return;
		}
		if (active.current !== node || !node.isConnected) return;
		cancelled.current = false;
		begin("image");
		node.src = src;
		finish();
	};
	const pickFile = (file: File | undefined) => {
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") void swapImage(reader.result);
		};
		reader.readAsDataURL(file);
	};
	const showRendered = (reload: boolean) => {
		const transaction = unrendered.current;
		if (transaction?.after) move(transaction.before, transaction.after, false);
		unrendered.current = null;
		for (const frame of root.current?.querySelectorAll("[data-render-state]") ?? [])
			frame.removeAttribute("data-render-state");
		setNotice({
			title: reload ? "Frame reloaded from saved source" : "Saved · visible result verified",
			detail: reload
				? "Explicit reload may reset application state. Other frames stay in place."
				: "The pending use now displays the saved result.",
		});
		refresh();
	};
	const retry = () => {
		const kept = retained.current;
		if (!kept || !selected?.isConnected || !root.current) {
			setNotice({
				title: "Select a target first",
				detail: "Your requested change remains available in Ask agent.",
				attention: true,
				recovery: "retry",
			});
			return;
		}
		const intendedNode = kept.after.find((entry) => entry.node === selected);
		if (!intendedNode) {
			setNotice({
				title: "Choose the original target",
				detail: "A different selection cannot silently inherit this edit. Ask the agent with your retained input.",
				attention: true,
				recovery: "retry",
			});
			return;
		}
		pending.current = { before: snapshot(root.current), label: kept.transaction.label };
		move(kept.transaction.before, kept.after, false);
		finish();
	};
	useEffect(() => {
		if (initialApplied.current || !selected || initial === "none") return;
		initialApplied.current = true;
		cancelled.current = false;
		css("padding-left", "28px");
		finish();
	}, [initial, selected]);
	useEffect(
		() => () => {
			saveGeneration.current++;
		},
		[],
	);
	const computed = selected ? getComputedStyle(selected) : null;
	const value = (property: string) =>
		(selected && scope !== "base" ? scopedStyle(selected).getPropertyValue(property) : "") ||
		selected?.style.getPropertyValue(property) ||
		computed?.getPropertyValue(property) ||
		"";
	const original = (property: string) => selected?.style.getPropertyValue(property) !== "";
	const numeric = (property: string) => {
		const raw = value(property);
		return (
			Number.parseFloat(
				raw.startsWith("var(") || raw.startsWith("calc(") || raw.endsWith("%")
					? (computed?.getPropertyValue(property) ?? "")
					: raw,
			) || 0
		);
	};
	const live = useRef({ cancel, history, finish, stopInline, viewport });
	live.current = { cancel, history, finish, stopInline, viewport };

	useLayoutEffect(() => {
		const page = root.current;
		if (!page) return;
		for (const group of page.querySelectorAll<HTMLElement>(GROUPS)) {
			group.dataset.preview = "";
			// Keep the original rendered plate while stopping its internal editor.
			for (const child of group.children) if (child instanceof HTMLElement) child.inert = true;
		}
		const nodes = [
			...page.querySelectorAll<HTMLElement>(
				".ev-screen, header, main, section, footer, nav, div, h1, h2, h3, p, a, button, small, span, summary, code, figure, figcaption, img",
			),
		];
		let id = 0;
		for (const node of nodes) {
			const group = node.closest(GROUPS);
			if (group && group !== node) continue;
			if (node.closest("[data-editor-furniture]") || node.matches(".ev-board,.ev-below")) continue;
			if (node.closest("dialog") || node.parentElement?.closest("[data-literal]")) continue;
			node.dataset.editNode = String(id++);
			if (node.matches("a[href$='Spool.dmg']")) node.dataset.shared = "download";
			if (node.matches("h1,h2,h3,p,small,figcaption,code,span") && !node.querySelector("svg,button,a,code"))
				node.dataset.literal = "";
			if (node.matches("a,button,summary") && !node.querySelector("[data-edit-node],code")) {
				const text = [...node.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
				for (const part of text) {
					const span = document.createElement("span");
					span.dataset.literal = "";
					span.dataset.editNode = String(id++);
					part.replaceWith(span);
					span.appendChild(part);
				}
			}
		}
		// Preserve the rendered page and element identities, but remove navigation
		// affordances from this editing-only fixture, including context-menu actions.
		for (const link of page.querySelectorAll("a,area")) {
			link.removeAttribute("href");
			link.removeAttribute("download");
			link.removeAttribute("target");
		}
		snapshot(page);
		const first = page.querySelector<HTMLElement>("[data-shared=button]");
		if (first) {
			active.current = first;
			setSelected(first);
		}
		const key = (event: KeyboardEvent) => {
			if (
				event.key === "Alt" &&
				!inline.current &&
				!(event.target instanceof HTMLElement && event.target.closest("input,textarea,select"))
			)
				setMeasuring(true);
			if (event.key === "Escape") {
				if (live.current.viewport.keyDown(event)) return;
				if (!pending.current && !inline.current) return;
				event.preventDefault();
				live.current.cancel();
				stage.current?.focus({ preventScroll: true });
				return;
			}
			const target = event.target;
			if (target instanceof HTMLElement && (target.closest("input,textarea,select") || target.isContentEditable))
				return;
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
				event.preventDefault();
				event.stopImmediatePropagation();
				live.current.history(event.shiftKey);
			}
			keyboard.current(event);
		};
		const keyUp = (event: KeyboardEvent) => {
			live.current.viewport.keyUp(event);
			if (event.key.startsWith("Arrow") && keyGesture.current) {
				keyGesture.current = false;
				live.current.finish();
			}
			if (event.key === "Alt") setMeasuring(false);
		};
		const blur = () => {
			if (keyGesture.current) live.current.cancel();
			setMeasuring(false);
			setHovered(null);
		};
		window.addEventListener("keydown", key, true);
		window.addEventListener("keyup", keyUp, true);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("keydown", key, true);
			window.removeEventListener("keyup", keyUp, true);
			window.removeEventListener("blur", blur);
			if (paint.current !== null) cancelAnimationFrame(paint.current);
			window.clearTimeout(feedbackTimer.current);
		};
	}, []);

	useEffect(() => {
		// The demo's authored declaration identities, never a text/import match.
		// Shared gestures own this signal even after the pointer leaves the rail.
		for (const node of root.current?.querySelectorAll<HTMLElement>("[data-shared]") ?? []) {
			const key = affected ?? ((reach || uses) && !pending.current ? sharedKey : null);
			node.toggleAttribute(
				"data-reach",
				node !== selected && (node === hoverUse || Boolean(key && node.dataset.shared === key)),
			);
		}
	}, [affected, reach, uses, sharedKey, selected, hoverUse, revision]);

	const tokenStateOpened = useRef(false);
	useEffect(() => {
		if (state !== "tokens" || !selected || tokenStateOpened.current) return;
		tokenStateOpened.current = true;
		const id = window.setTimeout(() => {
			const button = document.querySelector<HTMLButtonElement>('[aria-label="Choose gap"]');
			button?.scrollIntoView({ block: "center" });
			requestAnimationFrame(() => requestAnimationFrame(() => button?.click()));
		}, 80);
		return () => window.clearTimeout(id);
	}, [state, selected]);
	const textNode = selected ? literal(selected) : null;
	const parents: HTMLElement[] = [];
	let ancestor = selected?.parentElement;
	while (ancestor && ancestor !== root.current) {
		if (ancestor.dataset.editNode !== undefined) parents.unshift(ancestor);
		ancestor = ancestor.parentElement;
	}
	const startInline = (node: HTMLElement) => {
		const text = literal(node);
		if (!text || node.matches(GROUPS)) return;
		choose(node);
		cancelled.current = false;
		begin("text");
		inline.current = text;
		text.contentEditable = "plaintext-only";
		text.focus();
		const range = document.createRange();
		range.selectNodeContents(text);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		setHovered(null);
		setMeasuring(false);
		setHint("Type here. Double-click a word to select it. Escape cancels.");
	};
	keyboard.current = (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !(target === stage.current || root.current?.contains(target))) return;
		if (event.isComposing) return;
		if (event.shiftKey && event.code === "Digit2") {
			event.preventDefault();
			viewport.fitSelection(selected);
			return;
		}
		if (viewport.keyDown(event)) return;
		if (!selected || inline.current || viewport.panning) return;
		if (event.key === "Enter") {
			event.preventDefault();
			if (event.shiftKey) {
				const parent = selected.parentElement?.closest<HTMLElement>("[data-edit-node]");
				if (parent) choose(parent);
			} else if (literal(selected)) startInline(selected);
			return;
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			removeSelected();
			return;
		}
		if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || event.altKey) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.repeat && cancelled.current) return;
		const resize = event.metaKey || event.ctrlKey;
		const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
		const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
		const step = (forward ? 1 : -1) * (event.shiftKey ? 10 : 1);
		const style = getComputedStyle(selected);
		if (resize && ["inline", "contents", "none"].includes(style.display)) {
			setHint("This element takes its size from its content. Resize its container.");
			return;
		}
		if (!keyGesture.current) {
			cancelled.current = false;
			begin(resize ? "keyboard resize" : "keyboard move");
			keyGesture.current = true;
		}
		if (resize) {
			const property = horizontal ? "width" : "height";
			css(property, `${Math.max(1, Number.parseFloat(style.getPropertyValue(property)) + step)}px`);
			setHint("Resize · 1px · Shift 10px · Escape cancels this key press");
			return;
		}
		if (style.position === "absolute" || style.position === "fixed") {
			const start = horizontal ? "left" : "top";
			const end = horizontal ? "right" : "bottom";
			const from = Number.parseFloat(style.getPropertyValue(start));
			const to = Number.parseFloat(style.getPropertyValue(end));
			if (Number.isFinite(from)) localCss(start, `${from + step}px`);
			if (Number.isFinite(to)) localCss(end, `${to - step}px`);
			if (!Number.isFinite(from) && !Number.isFinite(to))
				localCss(start, `${(horizontal ? selected.offsetLeft : selected.offsetTop) + step}px`);
			setHint("Move · 1px · Shift 10px · Escape cancels this key press");
			return;
		}
		const parent = selected.parentElement;
		if (!parent) return;
		const layout = getComputedStyle(parent);
		const flex = layout.display === "flex" || layout.display === "inline-flex";
		const row = flex && layout.flexDirection.startsWith("row");
		const siblings = [...parent.children].filter(
			(n): n is HTMLElement =>
				n instanceof HTMLElement &&
				n.dataset.editNode !== undefined &&
				!["absolute", "fixed"].includes(getComputedStyle(n).position),
		);
		if (
			layout.display.includes("grid") ||
			horizontal !== row ||
			siblings.some((n) => getComputedStyle(n).order !== "0")
		) {
			setHint("Parent layout controls this position. Use layout alignment or spacing.");
			return;
		}
		const reversed = flex && layout.flexDirection.endsWith("reverse") !== (row && layout.direction === "rtl");
		const delta = forward !== reversed ? 1 : -1;
		const neighbor = siblings[siblings.indexOf(selected) + delta];
		if (neighbor && (!selected.dataset.stableKey || !neighbor.dataset.stableKey)) {
			cancel();
			setNotice({
				title: "This reorder needs stable keys",
				detail:
					"The items could exchange their running state. Nothing was saved. Ask the agent to add stable identities first.",
				attention: true,
			});
			return;
		}
		if (neighbor) {
			parent.insertBefore(selected, delta > 0 ? neighbor.nextSibling : neighbor);
			selected.scrollIntoView({ block: "nearest", inline: "nearest" });
			refresh();
		}
		setHint("Reorder in parent layout · move free elements by 1px · Escape cancels this key press");
	};

	const resolve = (target: EventTarget) => {
		if (!(target instanceof HTMLElement || target instanceof SVGElement)) return null;
		const element = target.closest<HTMLElement>("[data-edit-node]");
		if (
			element?.dataset.literal !== undefined &&
			!element.dataset.shared &&
			element.parentElement?.matches("a,button,summary")
		)
			return element.parentElement;
		return element;
	};
	const visibleOptional = OPTIONAL.filter(
		(property) =>
			selected?.style.getPropertyValue(property) ||
			(["gap", "letter-spacing"].includes(property) && numeric(property) !== 0) ||
			(property === "max-width" && value(property) !== "none"),
	);
	const gap = computed ? gapProperty(computed) : null;
	const gapPixels =
		gap && (computed?.getPropertyValue(gap) === "normal" || computed?.getPropertyValue(gap).endsWith("px"));
	const beginGap = () => {
		cancelled.current = false;
		setHovered(null);
		begin("gap");
	};
	const openGap = (anchor: GapAnchor) => {
		cancelled.current = false;
		setGapAnchor(anchor);
	};
	const numberRow = (
		property: string,
		unit = "px",
		min = 0,
		max = Number.POSITIVE_INFINITY,
		after?: React.ReactNode,
	) =>
		property === "max-width" && !value(property).endsWith("px") ? (
			<Row key={property} name={property}>
				<span className="ep-select" title="Constraint from the page">
					{value(property)}
				</span>
			</Row>
		) : (
			<NumberControl
				key={property}
				after={after}
				name={property}
				value={numeric(property)}
				unit={unit}
				min={min}
				max={max}
				changed={original(property)}
				onBegin={() => {
					cancelled.current = false;
					begin(property);
				}}
				onChange={(v) => css(property, `${v}${unit}`)}
				onFinish={finish}
				onCancel={cancel}
				cancelled={cancelled}
				onHint={setHint}
				onInspect={(on) => setPadding(on && NUMBERS.includes(property) ? property : null)}
			/>
		);
	const menu = (property: string, options: string[]) => (
		<Row name={property} changed={original(property)}>
			<Choice
				label={property}
				value={value(property)}
				options={[...new Set([value(property), ...options])].map((v) => ({ value: v }))}
				onChange={(v) => apply(property, v)}
			/>
		</Row>
	);
	const source =
		selected?.dataset.owner ?? selected?.closest<HTMLElement>("[data-owner]")?.dataset.owner ?? "frame source";
	const useDisclosure = (
		<button
			type="button"
			className="ei-owner"
			aria-label="Show affected uses"
			aria-expanded={uses}
			onClick={() => setUses(!uses)}
			onPointerEnter={() => setReach(true)}
			onPointerLeave={() => setReach(false)}
		>
			<span aria-hidden="true">◇</span>
			<span>{treatment === "line" ? "shared definition" : targets().length}</span>
			{treatment === "line" && <span>{targets().length} uses</span>}
			<span className="ei-chevron">⌄</span>
		</button>
	);

	return (
		<div className="ep-app ev-app ei-app" data-treatment={treatment}>
			<header className="ep-toolbar">
				<span className="ep-title">
					spool <span>northbound</span>
				</span>
				<span className="ep-boundary">editing interface</span>
				<div className="ep-zoom" role="toolbar" aria-label="Canvas zoom">
					<button type="button" aria-label="Zoom out" onClick={() => viewport.zoomBy(1 / 1.25)}>
						−
					</button>
					<button
						type="button"
						aria-label="Actual size"
						title="Actual size · Shift 0"
						onClick={viewport.actualSize}
					>
						{Math.round(viewport.zoom * 100)}%
					</button>
					<button type="button" aria-label="Zoom in" onClick={() => viewport.zoomBy(1.25)}>
						+
					</button>
					<button
						type="button"
						aria-label="Zoom to selection"
						title="Zoom to selection · Shift 2"
						onClick={() => viewport.fitSelection(selected)}
					>
						Fit selection
					</button>
				</div>
				<div>
					<button type="button" aria-label="Undo" disabled={!past.current.length} onClick={() => history(false)}>
						Undo
					</button>
					<button type="button" aria-label="Redo" disabled={!future.current.length} onClick={() => history(true)}>
						Redo
					</button>
				</div>

				<details className="ev-lab">
					<summary>Prototype</summary>
					<div className="ev-lab-body">
						<p>
							In-memory editing. Source labels, affected uses and save outcomes are authored for this example.
							Repository files stay unchanged.
						</p>
						<button type="button" onClick={() => window.location.reload()}>
							Reset prototype
						</button>
						<button type="button" onClick={() => setFirstUse(true)}>
							Show the first-use note
						</button>
						<p>
							{source}
							<br />
							Frame width {frameWidth}px · rendered{" "}
							{selected
								? `${Number((selected.getBoundingClientRect().width / viewport.zoom).toFixed(2))} × ${Number((selected.getBoundingClientRect().height / viewport.zoom).toFixed(2))}px`
								: "no selection"}
						</p>
						<button
							type="button"
							onClick={() => {
								stopInline();
								const next = frameWidth === 480 ? 820 : 480;
								setFrameWidth(next);
								for (const node of root.current?.querySelectorAll<HTMLElement>("[data-frame-shell]") ?? []) {
									node.style.width = `${next}px`;
									const label = node.querySelector(".ev-frame-label span");
									if (label) label.textContent = `${next} × auto`;
								}
								refresh();
							}}
						>
							Set frame width to {frameWidth === 480 ? 820 : 480}px
						</button>
						<p>
							Testing controls. Each case changes the next edit’s simulated outcome. These controls are not
							proposed product UI.
						</p>
						{Object.keys(faultNames)
							.filter((key): key is Fault => key in faultNames)
							.map((key) => (
								<button
									key={key}
									type="button"
									aria-pressed={key === faultName}
									onClick={() => {
										fault.current = key;
										setFaultName(key);
									}}
								>
									{faultNames[key]}
								</button>
							))}
						<button
							type="button"
							onClick={() => {
								const button = root.current?.querySelector<HTMLElement>("[data-shared=button]");
								if (button) choose(button, true);
							}}
						>
							Select the shared button
						</button>
						<button
							type="button"
							onClick={() => {
								const title = root.current?.querySelector<HTMLElement>("[data-custom]");
								if (title) choose(title, true);
							}}
						>
							Select the supplied heading
						</button>
						<button
							type="button"
							onClick={() => {
								const node = root.current?.querySelector<HTMLElement>(".ev-reorder p");
								if (node) {
									node.removeAttribute("data-stable-key");
									choose(node, true);
								}
							}}
						>
							Try an unsafe reorder with arrow keys
						</button>
						<button
							type="button"
							onClick={() => {
								stopInline();
								const owner = active.current?.closest<HTMLElement>("[data-frame-shell]");
								owner?.remove();
								setSelected(null);
								active.current = null;
								refresh();
								setNotice({
									title: "Starting frame removed",
									detail: "Shared Undo is still reachable and updates the surviving uses.",
								});
							}}
						>
							Remove the starting frame after a shared edit
						</button>
						<button
							type="button"
							onClick={() => {
								if (pending.current && root.current) {
									const after = snapshot(root.current);
									retained.current = {
										transaction: pending.current,
										after,
										intent: intentOf(pending.current.before, after, pending.current.label),
									};
								}
								cancel();
								past.current = [];
								future.current = [];
								setNotice({
									title: "Source service restarted",
									detail: `Previous undo history expired. ${retained.current ? `Your requested input is kept: ${retained.current.intent}.` : "Select again against current source."}`,
									attention: true,
								});
								refresh();
							}}
						>
							Restart the source service
						</button>
					</div>
				</details>
			</header>
			<style ref={projected} />
			<div className="ep-workspace">
				<div className="ep-stage-wrap">
					{firstUse && (
						<div className="ev-first-use">
							<strong>Edits save automatically.</strong>
							<p>
								Other editors and agents can still save these files. Simultaneous outside saves can overwrite
								changes, including edits that were already saved.
							</p>
							<button type="button" onClick={() => setFirstUse(false)}>
								Got it
							</button>
						</div>
					)}
					<div
						className="ep-stage"
						ref={stage}
						// biome-ignore lint/a11y/noNoninteractiveTabindex: This canvas receives selection-scoped editing shortcuts.
						tabIndex={0}
						role="application"
						aria-label="Editing canvas"
						data-panning={viewport.panning || undefined}
						onPointerMove={(e) => {
							pointer.current = { x: e.clientX, y: e.clientY };
							if (!e.buttons && !inline.current && !viewport.panning) setHovered(resolve(e.target));
						}}
						onPointerLeave={() => {
							pointer.current = null;
							setHovered(null);
						}}
						onScroll={() => {
							if (pointer.current && !inline.current) {
								const target = document.elementFromPoint(pointer.current.x, pointer.current.y);
								setHovered(target ? resolve(target) : null);
							}
						}}
					>
						<div
							ref={root}
							className="ep-document"
							style={{ width: viewport.width || undefined, zoom: viewport.zoom }}
							onAuxClickCapture={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							onInputCapture={() => {
								if (inline.current) {
									if (active.current?.dataset.shared === "button-part")
										for (const node of root.current?.querySelectorAll<HTMLElement>(
											"[data-shared=button-part]",
										) ?? [])
											if (node !== inline.current) node.textContent = inline.current.textContent;
									refresh();
								}
							}}
							onPointerDownCapture={(e) => {
								e.stopPropagation();
								if (!inline.current?.contains(e.target instanceof Node ? e.target : null)) e.preventDefault();
							}}
							onPointerUpCapture={(e) => e.stopPropagation()}
							onMouseDownCapture={(e) => e.stopPropagation()}
							onMouseUpCapture={(e) => e.stopPropagation()}
							onDragStartCapture={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							onClickCapture={(e) => {
								e.preventDefault();
								if (inline.current?.contains(e.target instanceof Node ? e.target : null)) {
									e.stopPropagation();
									return;
								}
								e.stopPropagation();
								const node = resolve(e.target);
								if (node && !e.altKey) choose(node);
							}}
							onDoubleClickCapture={(e) => {
								if (inline.current?.contains(e.target instanceof Node ? e.target : null)) {
									e.stopPropagation();
									return;
								}
								e.preventDefault();
								e.stopPropagation();
								const node = resolve(e.target);
								if (node && !e.altKey) startInline(node);
							}}
							onKeyDownCapture={(e) => {
								if (inline.current) {
									e.stopPropagation();
									if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
										e.preventDefault();
										stopInline();
									}
									return;
								}
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
									const node = resolve(e.target);
									if (node) choose(node);
								}
							}}
							onKeyUpCapture={(e) => e.stopPropagation()}
							onBlurCapture={(e) => {
								if (e.target === inline.current) stopInline();
							}}
							onSubmitCapture={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
						>
							<Demo />
						</div>
					</div>
					{selected && gap && gapPixels && (
						<GapOverlay
							key={selected.dataset.editNode}
							node={selected}
							property={gap}
							value={numeric(gap)}
							stage={stage}
							zoom={viewport.zoom}
							revision={revision}
							disabled={measuring || inline.current !== null || viewport.panning}
							cancelled={cancelled}
							onOpen={openGap}
							onBegin={() => {
								finish();
								setGapAnchor(null);
								beginGap();
							}}
							onChange={(v) => css(gap, v)}
							onFinish={finish}
							onCancel={cancel}
							onHint={setHint}
						/>
					)}
					<Selection
						selected={selected?.isConnected && computed?.display !== "none" ? selected : null}
						zoom={viewport.zoom}
						onPosition={localCss}
						onRestore={restoreProperty}
						hovered={hovered}
						measuring={measuring}
						editing={inline.current !== null}
						stage={stage}
						revision={revision}
						padding={padding}
						onBegin={() => {
							stopInline();
							cancelled.current = false;
							setHovered(null);
							begin("resize");
						}}
						onChange={css}
						onFinish={finish}
						onCancel={cancel}
						cancelled={cancelled}
						onHint={setHint}
					/>
				</div>
				<aside className="ep-rail" aria-label="Properties">
					<nav className="ep-crumbs" aria-label="Selection breadcrumb">
						{parents.map((node) => (
							<button key={node.dataset.editNode} type="button" onClick={() => choose(node)}>
								{name(node)}
								<span>›</span>
							</button>
						))}
					</nav>
					{selected && (
						<>
							<div className="ei-heading">
								<strong>{name(selected)}</strong>
								{shared && treatment === "inline" && useDisclosure}
								<Choice
									className="ei-actions-menu"
									label="Element actions"
									value=""
									options={[
										{ value: "hide", label: computed?.display === "none" ? "Show again" : "Hide element" },
										{ value: "delete", label: "Delete element", detail: "⌫" },
										{ value: "ask", label: "Ask agent" },
									]}
									onChange={(action) => {
										if (action === "delete") removeSelected();
										if (action === "hide") apply("display", computed?.display === "none" ? "" : "none");
										if (action === "ask") askAgent();
									}}
								>
									<span aria-hidden="true">···</span>
								</Choice>
							</div>
							{shared && treatment === "line" && <div className="ei-origin-line">{useDisclosure}</div>}
							{uses && (
								<div className="ei-uses">
									<p>{source}</p>
									{targets().map((node) => {
										const box = node.getBoundingClientRect();
										const view = stage.current?.getBoundingClientRect();
										const visible =
											view &&
											box.bottom > view.top &&
											box.top < view.bottom &&
											box.right > view.left &&
											box.left < view.right;
										return (
											<button
												key={node.dataset.editNode}
												type="button"
												onClick={() => {
													setHoverUse(null);
													choose(node, true);
												}}
												onPointerEnter={() => setHoverUse(node)}
												onPointerLeave={() => setHoverUse(null)}
											>
												<span>{node.closest<HTMLElement>("[data-frame-shell]")?.dataset.frameShell}</span>
												<span>{node === selected ? "selected" : visible ? "visible" : "reveal ↗"}</span>
											</button>
										);
									})}
								</div>
							)}
							<div className="ei-scope">
								<Choice
									label="Editing scope"
									value={scope}
									options={openedScopes.map((candidate) => ({
										value: candidate,
										label: candidate === "base" ? "base" : `${candidate}:`,
										detail:
											candidate === "md"
												? "frame ≥ 768px"
												: candidate === "hover"
													? "pointer over element"
													: "always",
									}))}
									onChange={(next) => {
										stopInline();
										setScope(next);
									}}
								/>
								{scope !== "base" && (
									<span className="ei-scope-condition">{scope === "md" ? "≥ 768px" : "on hover"}</span>
								)}
								{scope !== "base" && (
									<button
										type="button"
										className="ei-remove-scope"
										aria-label={`Remove ${scope} scope`}
										onClick={() => {
											stopInline();
											cancelled.current = false;
											begin(`remove ${scope} scope`);
											for (const node of targets()) node.removeAttribute(`data-${scope}-style`);
											finish();
											setScope("base");
											setOpenedScopes(openedScopes.filter((value) => value !== scope));
										}}
									>
										×
									</button>
								)}
								{openedScopes.length < 3 && (
									<button
										type="button"
										aria-label="Open a scope"
										onClick={() => setOpenedScopes(["base", "md", "hover"])}
									>
										+
									</button>
								)}
								{scope === "base" && (
									<span className="ei-scope-condition">{shared ? "shared styles" : "this use"}</span>
								)}
							</div>
							{computed?.display === "none" && (
								<div className="ei-hidden">
									Hidden{" "}
									<button type="button" onClick={() => apply("display", "")}>
										Show again
									</button>
								</div>
							)}
						</>
					)}

					<div
						className="ep-fields"
						data-empty={!selected || undefined}
						key={`${selected?.dataset.editNode}-${scope}`}
					>
						{!selected && <p className="ep-note">Select an element, or Undo to restore the removed one.</p>}
						{selected instanceof HTMLImageElement && (
							<Section name="Attributes">
								<Row name="image">
									<Choice
										label="image"
										value={selected.src === imageB ? "coast" : selected.src === imageA ? "hills" : "custom"}
										options={[
											{ value: "hills", label: "hills.svg" },
											{ value: "coast", label: "coast.svg" },
											{ value: "custom", label: "Chosen image", disabled: true },
										]}
										onChange={(next) => {
											if (next !== "custom") void swapImage(next === "hills" ? imageA : imageB);
										}}
									/>
								</Row>
								<Row name="choose a file">
									<input
										aria-label="Choose an image file"
										type="file"
										accept="image/*"
										onChange={(event) => pickFile(event.target.files?.[0])}
									/>
								</Row>
								<TextControl
									name="alt"
									value={selected.alt}
									onBegin={() => {
										cancelled.current = false;
										begin("alt");
									}}
									onChange={(text) => {
										selected.alt = text;
										refresh();
									}}
									onFinish={finish}
								/>
							</Section>
						)}

						{selected?.dataset.expression && (
							<Section name="Content" reason="calculated">
								<p className="ep-note">
									{selected.textContent} comes from {selected.dataset.expression}. Direct text editing is
									unavailable.{" "}
									<button type="button" onClick={askAgent}>
										Ask agent
									</button>
								</p>
							</Section>
						)}
						{textNode && (
							<Section name="Content" reason={sharedKey === "button-part" ? "shared definition" : "this use"}>
								<TextControl
									name="text"
									value={textNode.innerText}
									multiline
									onBegin={() => {
										cancelled.current = false;
										begin("text");
									}}
									onChange={(text) => {
										if (!cancelled.current) {
											for (const node of sharedKey === "button-part" ? targets() : [textNode])
												node.innerText = text;
											refresh();
										}
									}}
									onFinish={finish}
								/>
							</Section>
						)}
						{selected?.matches(GROUPS) && (
							<p className="ep-note">Demo preview. Edit its box; the inner demo stays still.</p>
						)}
						<div>
							<Section name="Layout">
								{menu("display", ["block", "flex", "grid", "inline-flex", "none"])}
								{["flex", "inline-flex", "grid"].includes(value("display")) && (
									<>
										{menu("flex-direction", ["row", "column"])}
										{menu("justify-content", ["normal", "flex-start", "center", "flex-end", "space-between"])}
										{menu("align-items", ["normal", "stretch", "flex-start", "center", "flex-end"])}
									</>
								)}
								{["width", "height"].map((axis) =>
									numberRow(
										axis,
										"px",
										0,
										Number.POSITIVE_INFINITY,
										<Choice
											className="ep-width-mode"
											label={`${axis} mode`}
											value={
												selected?.style.getPropertyValue(axis) === "100%"
													? "fill"
													: selected?.style.getPropertyValue(axis) &&
															selected.style.getPropertyValue(axis) !== "auto"
														? "fixed"
														: "auto"
											}
											options={(axis === "width" ? ["auto", "fill", "fixed"] : ["auto", "fixed"]).map(
												(v) => ({ value: v }),
											)}
											onChange={(next) =>
												apply(
													axis,
													next === "fill" ? "100%" : next === "auto" ? "auto" : `${numeric(axis)}px`,
												)
											}
										/>,
									),
								)}
								{NUMBERS.map((property) => numberRow(property))}
								{selected && gap && gapPixels && (
									<GapField
										declaration={
											scope === "base"
												? selected.style.getPropertyValue(gap)
												: scopedStyle(selected).getPropertyValue(gap)
										}
										node={selected}
										property={gap}
										value={numeric(gap)}
										anchor={gapAnchor}
										onOpen={openGap}
										onClose={() => setGapAnchor(null)}
										onBegin={beginGap}
										onChange={(v) => css(gap, v)}
										onFinish={finish}
										onCancel={cancel}
										cancelled={cancelled}
										revision={revision}
									/>
								)}
								{gap && !gapPixels && (
									<Row name="gap" ok={false}>
										<span title="Relative gap; source editing is outside this playground">{value(gap)}</span>
									</Row>
								)}
								{visibleOptional
									.filter((property) => property !== "letter-spacing" && !(gap && property === "gap"))
									.map((property) =>
										numberRow(property, "px", property.startsWith("margin-") ? Number.NEGATIVE_INFINITY : 0),
									)}
							</Section>
							<Section name="Typography">
								{numberRow("font-size")}
								{numberRow("line-height")}
								{visibleOptional.includes("letter-spacing") && numberRow("letter-spacing", "px", -100)}
								{menu("font-weight", ["400", "500", "600", "700"])}
								{menu("text-align", ["start", "left", "center", "right"])}
							</Section>
							<Section name="Appearance">
								{numberRow("border-radius")}
								{numberRow("opacity", "", 0, 1)}
								{selected &&
									["color", "background-color"].map((property) => (
										<ColorField
											authored={
												scope === "base"
													? selected.style.getPropertyValue(property)
													: scopedStyle(selected).getPropertyValue(property)
											}
											key={property}
											node={selected}
											name={property}
											value={value(property)}
											onBegin={() => {
												cancelled.current = false;
												begin(property);
											}}
											onChange={(v) => css(property, v)}
											onApply={(v) => apply(property, v)}
											onFinish={finish}
										/>
									))}
							</Section>
							<div className="ep-add">
								<Choice
									label="Add property"
									value=""
									placeholder="+ Add property"
									searchable
									options={OPTIONAL.filter(
										(property) => !visibleOptional.includes(property) && !(gap && property === "gap"),
									).map((v) => ({ value: v }))}
									onChange={(property) => {
										cancelled.current = false;
										css(
											property,
											`${property === "border-width" ? Math.max(1, numeric(property)) : numeric(property)}px`,
										);
										if (property === "border-width") css("border-style", "solid");
										finish();
									}}
								/>
							</div>
						</div>
					</div>

					<div
						className="ev-status"
						role="status"
						data-attention={notice.attention || undefined}
						data-quiet={(!notice.attention && request === null) || undefined}
					>
						<strong>{notice.title}</strong>
						<p>{notice.detail}</p>
						<div className="ev-actions">
							{notice.recovery === "retry" && (
								<button type="button" onClick={retry}>
									Retry this edit
								</button>
							)}
							{notice.recovery === "reload" && (
								<button type="button" onClick={() => showRendered(true)}>
									Reload confirmation · resets state
								</button>
							)}
							{notice.recovery === "render" && (
								<button type="button" onClick={() => showRendered(false)}>
									Finish simulated render
								</button>
							)}
							{notice.recovery === "rollback" && (
								<button type="button" onClick={() => history(false)}>
									Try Undo again
								</button>
							)}
							{notice.recovery === "unknown" && (
								<button
									type="button"
									onClick={() =>
										setNotice({
											title: "Current source read again",
											detail:
												"The requested value is present in this simulated case. The missing undo entry cannot be recovered. Select again for a fresh edit.",
										})
									}
								>
									Check current source
								</button>
							)}
							{(notice.attention || retained.current) && (
								<button type="button" onClick={askAgent}>
									Ask agent
								</button>
							)}
						</div>
						{request !== null && (
							<>
								<textarea
									className="ev-request"
									aria-label="Prepared agent request"
									value={request}
									onChange={(event) => setRequest(event.target.value)}
								/>
								<p>Prepared only. Review this before sending.</p>
								<div className="ev-actions">
									<button
										type="button"
										onClick={() => {
											setRequest(null);
											setNotice({
												title: "Request sent in this prototype",
												detail: "The send action was simulated. No agent was started.",
											});
										}}
									>
										Send request
									</button>
									<button type="button" onClick={() => setRequest(null)}>
										Dismiss
									</button>
								</div>
							</>
						)}
					</div>
					<div className="ep-hint" role="status">
						{hint}
					</div>
				</aside>
			</div>
		</div>
	);
}

function NumberControl({
	after,
	name,
	value,
	unit,
	min,
	max,
	changed,
	onBegin,
	onChange,
	onFinish,
	onCancel,
	cancelled,
	onHint,
	onInspect,
}: {
	after?: React.ReactNode;
	name: string;
	value: number;
	unit: string;
	min: number;
	max: number;
	changed: boolean;
	onBegin: () => void;
	onChange: (value: number) => void;
	onFinish: () => void;
	onCancel: () => void;
	cancelled: React.RefObject<boolean>;
	onHint: (value: string) => void;
	onInspect: (on: boolean) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const hold = useRef(false);
	const current = useRef(value);
	current.current = value;
	const bounded = (v: number) => Math.min(max, Math.max(min, v));
	const step = unit === "" ? 0.01 : 1;
	return (
		<div
			onPointerDownCapture={(e) => {
				if (!(e.target instanceof HTMLInputElement)) {
					if (
						document.activeElement instanceof HTMLInputElement ||
						document.activeElement instanceof HTMLTextAreaElement
					)
						document.activeElement.blur();
					setDraft(null);
				}
			}}
			onPointerEnter={() => {
				onHint(`${name} · drag label · ↑↓ ${step} · Shift ${step * 10}`);
				onInspect(true);
			}}
			onPointerLeave={() => onInspect(false)}
		>
			<Row
				name={name}
				changed={changed}
				onScrub={(units, shift) => {
					if (!hold.current) {
						onBegin();
						hold.current = true;
					}
					if (!cancelled.current) {
						current.current = bounded(current.current + units * step * (shift ? 10 : 1));
						onChange(current.current);
					}
				}}
				onScrubEnd={(cancelled) => {
					hold.current = false;
					if (cancelled) onCancel();
					else onFinish();
				}}
			>
				<label className={cn("ep-input", BOX, VALUE, changed && "text-thread")}>
					<input
						aria-label={name}
						role="spinbutton"
						aria-valuenow={value}
						aria-valuemin={Number.isFinite(min) ? min : undefined}
						aria-valuemax={Number.isFinite(max) ? max : undefined}
						inputMode="decimal"
						value={draft ?? String(value)}
						onFocus={(e) => {
							onBegin();
							e.target.select();
						}}
						onChange={(e) => {
							setDraft(e.target.value);
							const n = Number(e.target.value);
							if (e.target.value.trim() && Number.isFinite(n)) onChange(bounded(n));
						}}
						onBlur={() => {
							setDraft(null);
							onFinish();
						}}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Enter") {
								e.preventDefault();
								e.currentTarget.blur();
							}
							if (e.key === "ArrowUp" || e.key === "ArrowDown") {
								e.preventDefault();
								setDraft(null);
								onChange(bounded(value + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
							}
						}}
					/>
					<span>{unit}</span>
				</label>
				{after}
			</Row>
		</div>
	);
}
function TextControl({
	name,
	value,
	multiline = false,
	swatch = false,
	onBegin,
	onChange,
	onFinish,
}: {
	name: string;
	value: string;
	multiline?: boolean;
	swatch?: boolean;
	onBegin: () => void;
	onChange: (value: string) => void;
	onFinish: () => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const common = {
		"aria-label": name,
		id: `ep-field-${name}`,
		value: draft ?? value,
		onFocus: onBegin,
		onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setDraft(e.target.value);
			onChange(e.target.value);
		},
		onBlur: () => {
			setDraft(null);
			onFinish();
		},
		onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			e.stopPropagation();
			if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault();
				e.currentTarget.blur();
			}
		},
	};
	return (
		<Row name={name} tall={multiline}>
			<label htmlFor={`ep-field-${name}`} className={cn("ep-input", BOX, VALUE)}>
				{swatch && <span className="ep-swatch" style={{ background: value }} />}
				{multiline ? <textarea {...common} rows={3} /> : <input {...common} />}
			</label>
		</Row>
	);
}
