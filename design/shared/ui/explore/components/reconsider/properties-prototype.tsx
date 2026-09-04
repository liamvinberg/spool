import { useState } from "react";
import { anatomyOf, compiles, inScope, split, withScope } from "shared/lib/spool/properties-families";
import { cn } from "shared/lib/utils";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * Throwaway properties exploration, added after Liam asked for Tailwind as a
 * clean interface. Three separate frames share behavior and disagree on the UI.
 * Uses the existing design model for scopes and sample CSS compilation. Writes
 * remain in-memory; this is not a replacement parser, compiler, or source lane.
 */
type Take = "fields" | "utilities" | "nearby";
type Target = "Button" | "Card";
type Scope = "base" | "hover" | "md" | "md:hover";
type Group = "Layout" | "Spacing" | "Appearance" | "Type";
interface Choice {
	token: string;
	label: string;
}
interface Family {
	id: string;
	label: string;
	group: Group;
	matches: (token: string) => boolean;
	choices: readonly Choice[];
}
const choices = (tokens: readonly string[]): Choice[] => tokens.map((token) => ({ token, label: token }));
const FAMILIES: readonly Family[] = [
	{
		id: "display",
		label: "Display",
		group: "Layout",
		matches: (token) => ["flex", "inline-flex", "block", "grid"].includes(token),
		choices: choices(["inline-flex", "flex", "block", "grid"]),
	},
	{
		id: "items",
		label: "Align",
		group: "Layout",
		matches: (token) => token.startsWith("items-"),
		choices: choices(["items-start", "items-center", "items-end", "items-stretch"]),
	},
	{
		id: "justify",
		label: "Distribute",
		group: "Layout",
		matches: (token) => token.startsWith("justify-"),
		choices: choices(["justify-start", "justify-center", "justify-end", "justify-between"]),
	},
	{
		id: "gap",
		label: "Gap",
		group: "Spacing",
		matches: (token) => /^gap-(?!x|y)/.test(token),
		choices: choices(["gap-0", "gap-1", "gap-2", "gap-3", "gap-4", "gap-6"]),
	},
	{
		id: "p",
		label: "Padding",
		group: "Spacing",
		matches: (token) => token.startsWith("p-"),
		choices: choices(["p-0", "p-2", "p-4", "p-5", "p-6", "p-8"]),
	},
	{
		id: "px",
		label: "Horizontal",
		group: "Spacing",
		matches: (token) => token.startsWith("px-"),
		choices: choices(["px-0", "px-2", "px-3", "px-4", "px-5", "px-6", "px-8"]),
	},
	{
		id: "py",
		label: "Vertical",
		group: "Spacing",
		matches: (token) => token.startsWith("py-"),
		choices: choices(["py-0", "py-1", "py-2", "py-3", "py-4", "py-5", "py-6"]),
	},
	{
		id: "rounded",
		label: "Corners",
		group: "Appearance",
		matches: (token) => token.startsWith("rounded-"),
		choices: choices(["rounded-none", "rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-full"]),
	},
	{
		id: "bg",
		label: "Fill",
		group: "Appearance",
		matches: (token) => token.startsWith("bg-"),
		choices: choices(["bg-thread", "bg-[#bd301b]", "bg-[#356653]", "bg-[#405b8b]", "bg-white", "bg-transparent"]),
	},
	{
		id: "color",
		label: "Colour",
		group: "Type",
		matches: (token) =>
			["text-white", "text-text", "text-thread", "text-[#24312b]", "text-[#69746b]"].includes(token),
		choices: choices(["text-white", "text-text", "text-thread", "text-[#24312b]", "text-[#69746b]"]),
	},
	{
		id: "size",
		label: "Size",
		group: "Type",
		matches: (token) => /^(text-(xs|sm|base|lg|xl)|text-\[\d+px\])$/.test(token),
		choices: choices(["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-[15px]"]),
	},
	{
		id: "font",
		label: "Weight",
		group: "Type",
		matches: (token) => token.startsWith("font-"),
		choices: choices(["font-normal", "font-medium", "font-semibold", "font-bold"]),
	},
	{
		id: "opacity",
		label: "Opacity",
		group: "Appearance",
		matches: (token) => token.startsWith("opacity-"),
		choices: choices(["opacity-100", "opacity-80", "opacity-60", "opacity-40"]),
	},
];
const INITIAL: Record<Target, string> = {
	Button:
		"inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-thread text-white text-[15px] font-medium hover:bg-[#bd301b] md:px-6",
	Card: "block p-6 rounded-xl bg-white text-[#24312b]",
};
const HEADS: Record<Take, { title: string; note: string }> = {
	fields: {
		title: "The classes, as fields",
		note: "Only what this element uses. Familiar controls, with the Tailwind value in sight.",
	},
	utilities: {
		title: "The classes themselves",
		note: "A short utility list. Open a class to see and try its values.",
	},
	nearby: {
		title: "An editor beside the selection",
		note: "The same utilities in a small floating panel. More room for the canvas.",
	},
};

function familyOf(token: string): Family | undefined {
	return FAMILIES.find((family) => family.matches(anatomyOf(token).base));
}
function chain(scope: Scope): string[] {
	return scope === "base" ? [] : scope.split(":");
}
function declarations(classes: string): string {
	return split(classes)
		.flatMap((token) => {
			const result = compiles(token);
			return result.ok ? [result.css] : [];
		})
		.join(";");
}
function sampleColor(token: string): string | null {
	if (token === "bg-thread" || token === "text-thread") return "#f5391a";
	if (token === "bg-white" || token === "text-white") return "#fff";
	const found = /^(?:bg|text)-\[(#[a-fA-F0-9]+)\]$/.exec(token);
	return found?.[1] ?? null;
}

export function PropertiesReconsiderPrototype({ take }: { take: Take }) {
	const [target, setTarget] = useState<Target>("Button");
	const [scope, setScope] = useState<Scope>("base");
	const [source, setSource] = useState(INITIAL);
	const [history, setHistory] = useState<Record<Target, string>[]>([]);
	const [opened, setOpened] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [adding, setAdding] = useState(false);
	const [showSource, setShowSource] = useState(false);
	const [showUses, setShowUses] = useState(false);
	const [examples, setExamples] = useState(false);
	const [notice, setNotice] = useState("");
	const [peek, setPeek] = useState<string | null>(null);
	const [shown, setShown] = useState(true);
	const [hovering, setHovering] = useState(false);
	const literal = source[target];
	const own = inScope(literal, chain(scope));
	const base = inScope(literal, []);
	const inherited = scope === "md:hover" ? cn(base, inScope(literal, ["md"]), inScope(literal, ["hover"])) : base;
	const used = FAMILIES.filter((family) => split(cn(inherited, own)).some((token) => family.matches(token)));
	const unknown = split(own).filter((token) => familyOf(token) === undefined);
	const activeFamily = FAMILIES.find((family) => family.id === opened);
	const current = (family: Family) => split(own).find((token) => family.matches(token)) ?? null;
	const shownValue = (family: Family) =>
		current(family) ?? split(inherited).find((token) => family.matches(token)) ?? null;
	const write = (token: string | null, remove?: string) => {
		let writeScope = chain(scope);
		let nextToken = token;
		if (token !== null) {
			const anatomy = anatomyOf(token);
			if (anatomy.variants.length > 0) {
				writeScope = [...anatomy.variants];
				nextToken = inScope(token, anatomy.variants);
			}
			const valid = compiles(token);
			if (!valid.ok) {
				setNotice(`Prototype: ${valid.reason}`);
				return;
			}
		}
		const updated = withScope(literal, writeScope, (scoped) => {
			const without = remove
				? split(scoped)
						.filter((value) => value !== remove)
						.join(" ")
				: scoped;
			return nextToken === null ? without : cn(without, nextToken);
		});
		if (updated === literal) {
			setPeek(null);
			setOpened(null);
			return;
		}
		setHistory([...history, source]);
		setSource({ ...source, [target]: updated });
		setPeek(null);
		setOpened(null);
		setQuery("");
		setAdding(false);
		setNotice("");
	};
	const undo = () => {
		const previous = history.at(-1);
		if (previous) {
			setSource(previous);
			setHistory(history.slice(0, -1));
			setPeek(null);
		}
	};
	const pick = (next: Target) => {
		setTarget(next);
		setScope("base");
		setOpened(null);
		setAdding(false);
		setQuery("");
		setShown(true);
	};
	const preview = (name: Target) => {
		const raw = source[name];
		const inBase = inScope(raw, []);
		const mid = scope.startsWith("md") ? inScope(raw, ["md"]) : "";
		const over = scope.includes("hover") || hovering ? inScope(raw, ["hover"]) : "";
		const compound = scope === "md:hover" ? inScope(raw, ["md", "hover"]) : "";
		return declarations(cn(inBase, mid, over, compound, name === target ? peek : null));
	};
	const candidateTokens = activeFamily
		? activeFamily.choices.map((choice) => choice.token)
		: FAMILIES.flatMap((family) => family.choices.map((choice) => choice.token));
	const matches = candidateTokens.filter(
		(token) =>
			token.toLowerCase().includes(query.toLowerCase()) ||
			familyOf(token)?.label.toLowerCase().includes(query.toLowerCase()),
	);
	const exact = query.trim();
	const gate = exact ? compiles(exact) : null;
	const editValues = (family: Family) => {
		setOpened(opened === family.id ? null : family.id);
		setAdding(false);
		setQuery("");
		setPeek(null);
	};
	const picker =
		opened !== null || adding ? (
			<div className="border-y border-border-raised bg-surface p-3" onMouseLeave={() => setPeek(null)}>
				<div className="mb-2 flex items-center justify-between font-mono text-[10px] text-muted">
					<span>{activeFamily ? activeFamily.label.toLowerCase() : "add a class"}</span>
					<button
						type="button"
						aria-label="Close values"
						onClick={() => {
							setOpened(null);
							setAdding(false);
							setPeek(null);
						}}
					>
						esc ×
					</button>
				</div>
				<input
					aria-label="Find a Tailwind value"
					autoFocus
					placeholder={activeFamily ? `Find or type ${activeFamily.id}-…` : "Search classes or type a value"}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							setOpened(null);
							setAdding(false);
							setPeek(null);
						}
						if (event.key === "Enter" && exact) write(exact);
					}}
					className="w-full border-b border-border-raised bg-transparent pb-2 font-mono text-xs outline-none"
				/>
				<div className="mt-2 max-h-[220px] overflow-auto">
					{matches.slice(0, 24).map((token) => (
						<button
							type="button"
							key={token}
							onMouseEnter={() => setPeek(token)}
							onFocus={() => setPeek(token)}
							onClick={() => write(token)}
							className="flex min-h-9 w-full items-center justify-between gap-2 rounded-sm px-2 text-left font-mono text-xs hover:bg-raised focus:bg-raised"
						>
							<span className="flex items-center gap-2">
								{sampleColor(token) ? (
									<span
										className="h-3 w-3 rounded-sm border border-white/15"
										style={{ background: sampleColor(token) ?? undefined }}
									/>
								) : null}
								{token}
							</span>
							<span className="text-[10px] text-muted">
								{current(activeFamily ?? familyOf(token) ?? FAMILIES[0]!) === token ? "✓" : ""}
							</span>
						</button>
					))}
				</div>
				{exact && !matches.includes(exact) ? (
					<button
						type="button"
						disabled={gate?.ok !== true}
						onClick={() => write(exact)}
						className="mt-2 block w-full py-2 text-left font-mono text-xs text-thread disabled:text-muted"
					>
						{gate?.ok ? `Use ${exact} ↵` : `Prototype: ${gate && !gate.ok ? gate.reason : "type a class"}`}
					</button>
				) : null}
				{activeFamily && current(activeFamily) !== null ? (
					<button
						type="button"
						onClick={() => write(null, current(activeFamily) ?? undefined)}
						className="mt-2 w-full border-t border-border-raised pt-3 text-left font-mono text-[10px] text-muted hover:text-text"
					>
						Remove {current(activeFamily)}
						{scope !== "base" ? " · use base value" : ""}
					</button>
				) : null}
			</div>
		) : null;
	const utilityRow = (family: Family, compact: boolean) => {
		const value = shownValue(family);
		return (
			<div key={family.id}>
				<button
					type="button"
					onClick={() => editValues(family)}
					aria-label={`Edit ${family.label}`}
					className={cn(
						"group flex w-full items-center justify-between gap-2 text-left hover:bg-surface",
						compact ? "min-h-9 px-4" : "min-h-10 px-5",
						opened === family.id && "bg-surface",
					)}
				>
					{compact ? (
						<span
							className={cn(
								"flex items-center gap-2 font-mono text-xs",
								current(family) === null && "text-muted",
							)}
						>
							{sampleColor(value ?? "") ? (
								<span
									className="h-3 w-3 rounded-sm border border-white/15"
									style={{ background: sampleColor(value ?? "") ?? undefined }}
								/>
							) : null}
							{value}
						</span>
					) : (
						<>
							<span className="text-xs text-muted">{family.label}</span>
							<span
								className={cn(
									"flex items-center gap-2 font-mono text-xs",
									current(family) === null && "text-muted",
								)}
							>
								{sampleColor(value ?? "") ? (
									<span
										className="h-3 w-3 rounded-sm border border-white/15"
										style={{ background: sampleColor(value ?? "") ?? undefined }}
									/>
								) : null}
								{value}
							</span>
						</>
					)}
					{compact ? (
						<span className="font-mono text-[10px] text-muted opacity-0 group-hover:opacity-100">
							{current(family) === null ? "base" : "⌄"}
						</span>
					) : null}
				</button>
				{opened === family.id ? picker : null}
			</div>
		);
	};
	const panel = (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
				<span className="text-base font-medium">{target}</span>
				<button type="button" aria-label="Close properties" onClick={() => setShown(false)} className="text-muted">
					×
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="px-4 pt-3 pb-2">
					<button
						type="button"
						onClick={() => setShowUses(!showUses)}
						className="flex w-full items-center justify-between font-mono text-[10px] text-muted hover:text-text"
					>
						<span>shared/ui/{target.toLowerCase()}.tsx</span>
						<span>3 frames {showUses ? "⌃" : "⌄"}</span>
					</button>
					{showUses ? (
						<div className="mt-3 space-y-2 font-mono text-xs">
							{["checkout", "receipt", "system/primitives"].map((name) => (
								<button
									key={name}
									type="button"
									onClick={() => setExamples(name === "system/primitives")}
									className="block text-muted hover:text-thread"
								>
									{name} ↗
								</button>
							))}
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-1 border-b border-border px-3 pb-2">
					{(["base", "hover", "md", "md:hover"] as const).map((key) => (
						<button
							key={key}
							type="button"
							aria-pressed={scope === key}
							onClick={() => {
								setScope(key);
								setOpened(null);
								setAdding(false);
								setQuery("");
								setPeek(null);
							}}
							className={cn(
								"rounded-sm px-2 py-1.5 font-mono text-[10px]",
								scope === key ? "bg-surface text-text" : "text-muted hover:text-text",
							)}
						>
							{key === "base" ? "base" : `${key}:`}
						</button>
					))}
				</div>
				{scope !== "base" ? (
					<p className="px-4 pt-3 text-[10px] leading-4 text-muted">
						{split(own).length} {split(own).length === 1 ? "class" : "classes"} here. Muted values{" "}
						{scope === "md:hover" ? "come from broader rules" : "come from base"}.
					</p>
				) : null}
				<div className="py-2">
					{take === "fields"
						? (["Layout", "Spacing", "Appearance", "Type"] as const).map((group) => {
								const members = used.filter((family) => family.group === group);
								return members.length ? (
									<div key={group} className="pb-3">
										<div className="px-5 pt-3 pb-1 text-xs font-medium">{group}</div>
										{members.map((family) => utilityRow(family, false))}
									</div>
								) : null;
							})
						: used.map((family) => utilityRow(family, true))}
					{unknown.map((token) => (
						<div key={token} className="flex items-center justify-between px-4 py-2 font-mono text-xs">
							<span>{token}</span>
							<button
								aria-label={`Remove ${token}`}
								type="button"
								onClick={() => write(null, token)}
								className="text-muted"
							>
								×
							</button>
						</div>
					))}
				</div>
				{adding ? (
					picker
				) : (
					<button
						type="button"
						onClick={() => {
							setAdding(true);
							setOpened(null);
							setQuery("");
							setPeek(null);
						}}
						className="mx-4 mb-4 flex w-[calc(100%-32px)] items-center justify-between border-t border-border pt-3 font-mono text-xs text-muted hover:text-text"
					>
						<span>+ Add class</span>
						<span>↵</span>
					</button>
				)}
				{notice ? <p className="px-4 pb-3 text-xs text-muted">{notice}</p> : null}
			</div>
			<div className="shrink-0 border-t border-border p-4">
				<button
					type="button"
					onClick={() => setExamples(!examples)}
					className="font-mono text-[10px] text-muted hover:text-text"
				>
					{examples ? "← Back to checkout" : "View examples ↗"}
				</button>
			</div>
		</div>
	);
	return (
		<div className="flex h-full flex-col bg-bg text-text">
			<div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
				<div>
					<h1 className="text-xl font-medium">{HEADS[take].title}</h1>
					<p className="mt-1 text-sm text-muted">{HEADS[take].note}</p>
				</div>
				<div className="flex items-center gap-4 font-mono text-xs text-muted">
					<span>prototype · edits stay here</span>
					<button
						type="button"
						onClick={undo}
						disabled={history.length === 0}
						className="hover:text-text disabled:opacity-30"
					>
						Undo
					</button>
					<button
						type="button"
						onClick={() => {
							setSource(INITIAL);
							setHistory([]);
							setPeek(null);
							setOpened(null);
							setQuery("");
							setAdding(false);
						}}
						className="hover:text-text"
					>
						Reset
					</button>
				</div>
			</div>
			<div className="min-h-0 flex-1">
				<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom="100%">
					<CanvasChrome
						pages={[
							{ name: "booking", frames: ["checkout", "receipt"], open: true, active: !examples },
							{ name: "system", frames: ["primitives"], open: true, active: examples },
						]}
						selected={examples ? "primitives" : "checkout"}
						holding={["checkout", "receipt", "primitives"]}
						tool="edit"
						rail={take === "nearby" || !shown ? null : panel}
						railWidth={300}
					>
						<style>{`.properties-demo-button { ${preview("Button")} } .properties-demo-card { ${preview("Card")} }`}</style>
						<div className="relative h-full overflow-auto p-8">
							<div className="mb-8 flex items-center justify-between font-mono text-xs text-muted">
								<span>
									{examples ? "system / primitives" : "booking"}
									{scope !== "base" ? ` · ${scope}: preview` : ""}
								</span>
								<div className="flex gap-4">
									<button type="button" onClick={() => setExamples(!examples)} className="hover:text-text">
										{examples ? "← Checkout" : "Primitives ↗"}
									</button>
									{!shown ? (
										<button type="button" onClick={() => setShown(true)} className="hover:text-text">
											Properties
										</button>
									) : null}
								</div>
							</div>
							{examples ? (
								<div className="max-w-[640px]">
									<h2 className="mb-2 text-2xl font-medium">The same Button.</h2>
									<p className="mb-8 text-sm text-muted">
										Change it here or in checkout. Both use the same classes.
									</p>
									<div className="border-y border-border py-10">
										<div className="flex items-center gap-8">
											{["Pay 126 kr", "Show ticket", "Continue"].map((label) => (
												<DemoButton
													key={label}
													label={label}
													selected={target === "Button"}
													onSelect={() => pick("Button")}
													onHover={setHovering}
												/>
											))}
										</div>
									</div>
									<button
										type="button"
										onClick={() => pick("Card")}
										className="mt-10 mb-4 font-mono text-xs text-muted"
									>
										Card
									</button>
									<div className="properties-demo-card max-w-[300px]">
										<h3 className="text-lg">Saturday, 14 June</h3>
										<p className="mt-2 text-sm">Four departures to Ramsö.</p>
									</div>
								</div>
							) : (
								<div
									className={cn("grid gap-8", take === "nearby" ? "max-w-[730px] grid-cols-2" : "grid-cols-2")}
								>
									{["checkout", "receipt"].map((name) => (
										<div key={name}>
											<div className="mb-3 font-mono text-[10px] text-muted">{name}</div>
											<div
												className={cn(
													"properties-demo-card min-h-[360px]",
													target === "Card" && "outline outline-1 outline-offset-4 outline-thread",
												)}
												onPointerDown={() => {
													if (target !== "Card") pick("Card");
												}}
											>
												<div className="mb-9 flex items-center justify-between border-b border-black/10 pb-4">
													<span className="text-2xl font-semibold">Tvärsö</span>
													<span>≋</span>
												</div>
												<h2 className="mb-3 text-[26px] leading-tight">
													{name === "checkout" ? "A little further out." : "See you on board."}
												</h2>
												<p className="mb-7 text-sm leading-6 text-[#69746b]">
													Stockholm → Ramsö
													<br />
													Saturday, 14 June · 10:30
												</p>
												<div className="mb-7 flex justify-between border-y border-black/10 py-3 text-sm">
													<span>2 adults</span>
													<span>126 kr</span>
												</div>
												<DemoButton
													label={name === "checkout" ? "Pay 126 kr" : "Show ticket"}
													selected={target === "Button"}
													onSelect={() => pick("Button")}
													onHover={setHovering}
												/>
											</div>
										</div>
									))}
								</div>
							)}
							{take === "nearby" && shown ? (
								<div className="absolute top-[100px] right-5 z-10 max-h-[calc(100%-150px)] w-[280px] overflow-hidden rounded-lg border border-border-raised bg-bg">
									{panel}
								</div>
							) : null}
							{take !== "nearby" ? (
								<p className="mt-8 max-w-[380px] text-sm leading-5 text-muted">
									Pick the button or its card. Each selection brings only its own classes.
								</p>
							) : null}
						</div>
					</CanvasChrome>
				</SpoolShell>
			</div>
			<div className="shrink-0 border-t border-border bg-bg px-6 py-3">
				<div className="flex items-center justify-between font-mono text-[10px] text-muted">
					<span>
						{peek
							? `previewing ${peek}`
							: `editing ${target} · ${scope === "base" ? "base classes" : `${scope}: only`}`}
					</span>
					<button type="button" onClick={() => setShowSource(!showSource)} className="hover:text-text">
						{showSource ? "Hide" : "Show"} className
					</button>
				</div>
				{showSource ? (
					<pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs leading-5">{literal}</pre>
				) : null}
			</div>
		</div>
	);
}

function DemoButton({
	label,
	selected,
	onSelect,
	onHover,
}: {
	label: string;
	selected: boolean;
	onSelect: () => void;
	onHover: (value: boolean) => void;
}) {
	return (
		<div
			className={cn("inline-block", selected && "outline outline-1 outline-offset-4 outline-thread")}
			onPointerDown={(event) => {
				event.stopPropagation();
				onSelect();
			}}
		>
			<button
				type="button"
				className="properties-demo-button"
				onMouseEnter={() => onHover(true)}
				onMouseLeave={() => onHover(false)}
			>
				{label}
				<span aria-hidden="true">↗</span>
			</button>
		</div>
	);
}
