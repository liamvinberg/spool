import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { accelLabel } from "../runtime/platform-keys";
import {
	APPEARANCES,
	type Appearance,
	DARK_TOKENS,
	parseSetting,
	parseThemeKey,
	type SettingKey,
	type SettingReading,
	type SettingScope,
	THEME_LOOKS,
	THEME_TOKEN_NAMES,
	type ThemeLook,
	type ThemeToken,
	themeKey,
	themeTokens,
} from "../settings/registry";
import { matchPreset, PRESETS, parseTheme, printTheme, type ThemeSpec, themeWrites } from "../settings/themes";
import { cn } from "./cn";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import { type HotkeyIdFor, hotkeyKey } from "./hotkeys";
import { RibbonMark } from "./icons";
import { useSettings, useWriteSetting, useWriteSettings } from "./settings";

/**
 * The settings sheet (#282): everything a person is allowed to change, drawn
 * from the registry and written through it. Opens the way the shortcut sheet
 * opens, from the cog at the foot of the dock or ⌘,, and goes on esc.
 *
 * Nothing about a setting is typed twice here. A row is its entry's label, its
 * `says` under it, and the control its shape names, so a new registry entry is
 * a new row with no change on this side. The rows stand in bands headed by the
 * file the change lands in, and a person reading a filename knows the reach of
 * a change without a word about precedence.
 *
 * A write is the daemon's word or nothing: the control shows the file's value
 * until the reading comes back, and a refusal shows its reason under the row.
 * Nothing here is remembered in the browser, not the open tab, not a draft.
 */

export type SettingsTab = "general" | "appearance";

export function SettingsSheet({ project, onClose }: { project: string | undefined; onClose: () => void }) {
	const [tab, setTab] = useState<SettingsTab>("general");
	const snapshot = useSettings(project);
	const write = useWriteSetting(project);
	const writeMany = useWriteSettings(project);

	useEffect(() => {
		return attachHotkeyLayer({
			scope: "settings",
			handlers: {
				"settings.close": (event) => {
					event?.preventDefault();
					onClose();
				},
			} satisfies Record<HotkeyIdFor<"settings">, HotkeyHandler>,
		});
	}, [onClose]);

	const entries = snapshot?.entries ?? [];

	return (
		<>
			<div className="absolute inset-0 z-30 animate-find-in bg-bg/48 backdrop-blur-[2px]">
				<button
					type="button"
					aria-label="Close settings"
					tabIndex={-1}
					className="absolute inset-0 cursor-default"
					onMouseDown={onClose}
				/>
			</div>
			<div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-8">
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Settings"
					className="pointer-events-auto flex max-h-[calc(100%-128px)] min-h-[560px] w-[760px] animate-find-panel-in flex-col overflow-hidden rounded-lg border border-border-raised bg-surface"
				>
					<header className="flex h-12 shrink-0 items-center justify-between border-border border-b px-6">
						<span className="font-semibold text-md text-text tracking-tight leading-md">Settings</span>
						<span className="font-mono text-2xs text-muted leading-3">esc closes</span>
					</header>
					<TabRow tab={tab} onTab={setTab} />
					<div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-8">
						{snapshot === undefined ? null : tab === "general" ? (
							<General project={project} entries={entries} write={write} />
						) : (
							<AppearanceTab entries={entries} write={write} writeMany={writeMany} />
						)}
					</div>
				</div>
			</div>
		</>
	);
}

type Write = ReturnType<typeof useWriteSetting>;
type WriteMany = ReturnType<typeof useWriteSettings>;

function TabRow({ tab, onTab }: { tab: SettingsTab; onTab: (tab: SettingsTab) => void }) {
	const tabs: readonly { id: SettingsTab; name: string }[] = [
		{ id: "general", name: "General" },
		{ id: "appearance", name: "Appearance" },
	];
	return (
		<div className="flex h-10 shrink-0 items-stretch gap-6 border-border border-b px-6">
			{tabs.map((candidate) => (
				<button
					key={candidate.id}
					type="button"
					role="tab"
					aria-selected={tab === candidate.id}
					onClick={() => onTab(candidate.id)}
					className={cn(
						"relative flex items-center text-base leading-base transition-colors duration-150",
						tab === candidate.id ? "text-text" : "text-muted hover:text-text",
					)}
				>
					{candidate.name}
					{tab === candidate.id ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
				</button>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ general -- */

/** The bands, in the order a person reads them: nearest reach first. */
const BANDS: readonly { scope: SettingScope; name: string; file: string; note?: string }[] = [
	{ scope: "project", name: "This project", file: "design/canvas.json" },
	{ scope: "local", name: "This project, on this machine", file: "~/.spool/registry.json" },
	{ scope: "machine", name: "This machine", file: "~/.spool/config.json" },
];

function General({
	project,
	entries,
	write,
}: {
	project: string | undefined;
	entries: readonly SettingReading[];
	write: Write;
}) {
	const general = entries.filter((entry) => entry.group === "general" || entry.group === "agent");
	return (
		<div className="flex flex-col gap-8">
			{BANDS.map((band) => {
				const rows = general.filter((entry) => entry.scope === band.scope);
				if (rows.length === 0) return null;
				const needsProject = band.scope !== "machine" && project === undefined;
				return (
					<Band
						key={band.scope}
						name={band.name}
						file={band.file}
						aside={
							band.scope === "project" && project !== undefined ? (
								<span className="font-mono text-muted text-xs leading-xs">{project}</span>
							) : undefined
						}
					>
						{needsProject ? (
							<p className="border-border border-t pt-3.5 text-muted text-sm leading-sm">
								Open a project to change these.
							</p>
						) : (
							rows.map((entry) => <SettingRow key={entry.key} entry={entry} write={write} />)
						)}
					</Band>
				);
			})}
			<p className="border-border border-t pt-5 text-muted text-sm leading-sm">
				spool writes a file when something here moves, only the key that moved. Every other key in it is left the
				way you typed it.
			</p>
		</div>
	);
}

/** One registry entry, as its shape draws it. */
function SettingRow({ entry, write }: { entry: SettingReading; write: Write }) {
	const [reason, setReason] = useState<string | undefined>();
	const move = async (value: boolean | string) => {
		const written = await write(entry.key, value);
		setReason(written.ok ? undefined : written.reason);
	};
	return (
		<Row label={entry.label} says={entry.says} reason={reason}>
			{entry.shape.kind === "boolean" ? (
				<Switch on={Boolean(entry.value)} label={entry.label} onChange={move} />
			) : entry.shape.kind === "choice" ? (
				<Segmented choices={entry.shape.choices} value={String(entry.value)} label={entry.label} onChange={move} />
			) : (
				<ColourControl settingKey={entry.key} value={String(entry.value)} label={entry.label} onChange={move} />
			)}
		</Row>
	);
}

/* --------------------------------------------------------------- appearance -- */

/** The look the system is in, live, for `system` to follow. */
function useSystemLook(): ThemeLook {
	const query = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined);
	return useSyncExternalStore(
		(listen) => {
			const media = query();
			media?.addEventListener("change", listen);
			return () => media?.removeEventListener("change", listen);
		},
		() => (query()?.matches === false ? "light" : "dark"),
		() => "dark",
	);
}

function AppearanceTab({
	entries,
	write,
	writeMany,
}: {
	entries: readonly SettingReading[];
	write: Write;
	writeMany: WriteMany;
}) {
	const appearance = entries.find((entry) => entry.key === "appearance");
	const look = (appearance?.value as Appearance | undefined) ?? "dark";
	const systemLook = useSystemLook();
	/** the look on screen right now, which is the one an edit should be about */
	const shown: ThemeLook = look === "system" ? systemLook : look;
	const [editing, setEditing] = useState<ThemeLook | null>(null);
	const editLook = editing ?? shown;
	const tokens = themeTokens(entries, editLook);
	const themed = entries.filter(
		(entry): entry is SettingReading & { value: string } => parseThemeKey(entry.key) !== undefined,
	);
	const moved = themed.filter((entry) => entry.source === "file");
	const movedHere = moved.filter((entry) => parseThemeKey(entry.key)?.look === editLook);
	const [customize, setCustomize] = useState(false);
	const [reason, setReason] = useState<string | undefined>();

	const setLook = async (next: Appearance) => {
		const written = await write("appearance", next);
		setReason(written.ok ? undefined : written.reason);
	};

	/**
	 * A theme into its look. Under a fixed look that is the other one, the look
	 * follows, since a theme nobody can see was not what was asked for; under
	 * `system` the theme waits for its look, which is the point of system.
	 */
	const apply = async (theme: ThemeSpec) => {
		const writes: { key: SettingKey; value: string }[] = themeWrites(theme);
		if (look !== "system" && look !== theme.appearance) writes.push({ key: "appearance", value: theme.appearance });
		const written = await writeMany(writes);
		setReason(written.ok ? undefined : written.reason);
		if (written.ok) setEditing(theme.appearance);
	};

	const reset = async () => {
		const written = await writeMany(moved.map((entry) => ({ key: entry.key, value: null })));
		setReason(written.ok ? undefined : written.reason);
	};

	const current = matchPreset(editLook, tokens);
	const thread = themed.find((entry) => entry.key === themeKey(editLook, "thread"));

	return (
		<div className="flex flex-col gap-8">
			<Band name="Appearance" file="~/.spool/config.json">
				<div className="flex gap-3 pt-3">
					{APPEARANCES.map((candidate) => (
						<LookCard
							key={candidate}
							look={candidate}
							selected={look === candidate}
							dark={themeTokens(entries, "dark")}
							light={themeTokens(entries, "light")}
							onPick={() => void setLook(candidate)}
						/>
					))}
				</div>
				{reason === undefined ? null : <Reason>{reason}</Reason>}
				<p className="pt-4 text-muted text-sm leading-sm">
					{appearance?.says}
					{look === "system" ? ` The system is ${systemLook} now.` : ""}
				</p>
			</Band>

			<Band
				name="Theme"
				file="~/.spool/config.json"
				aside={
					<span className="flex items-center gap-3">
						<Segmented
							choices={THEME_LOOKS}
							value={editLook}
							label="Theme for"
							onChange={(next) => setEditing(next as ThemeLook)}
						/>
						<ShareTheme
							theme={{ name: current?.name ?? "Custom", appearance: editLook, tokens }}
							onPaste={apply}
						/>
					</span>
				}
			>
				<div className="grid grid-cols-4 gap-2 pt-3">
					{PRESETS.filter((preset) => preset.appearance === editLook).map((preset) => (
						<PresetCard
							key={preset.name}
							theme={preset}
							selected={current?.name === preset.name}
							onPick={() => void apply(preset)}
						/>
					))}
					{current === undefined ? (
						<PresetCard theme={{ name: "Custom", appearance: editLook, tokens }} selected onPick={() => {}} />
					) : null}
				</div>
				<p className="pt-4 text-muted text-sm leading-sm">
					A theme is ten colours for one look. Pick one, or paste one somebody copied out of their spool.
				</p>
			</Band>

			{thread === undefined ? null : (
				<Band name="Accent" file="~/.spool/config.json">
					<AccentRow entry={thread} write={write} />
				</Band>
			)}

			<section className="flex flex-col">
				<div className="flex h-6 items-center justify-between gap-6">
					<button
						type="button"
						aria-expanded={customize}
						onClick={() => setCustomize(!customize)}
						className="flex items-center gap-2 text-left"
					>
						<Chevron open={customize} />
						<span className="font-medium text-md text-text leading-md">Customize</span>
						<span className="font-mono text-2xs text-muted/70 leading-3">
							{editLook} · {THEME_TOKEN_NAMES.length + 1} tokens
							{movedHere.length === 0 ? "" : ` · ${movedHere.length} moved`}
						</span>
					</button>
					<button
						type="button"
						disabled={moved.length === 0}
						onClick={() => void reset()}
						className={cn(
							"shrink-0 text-sm leading-sm transition-colors duration-150",
							moved.length === 0 ? "text-muted/40" : "text-thread hover:text-text",
						)}
					>
						Reset to spool’s
					</button>
				</div>
				<p className="max-w-[460px] pt-1.5 pl-[18px] text-muted text-sm leading-sm">
					The interface’s own colours for the {editLook} look. The chrome is built on these, so they are the whole
					of what a theme can move.
				</p>
				{customize ? (
					<div className="flex flex-col pt-4">
						{themed
							.filter((entry) => parseThemeKey(entry.key)?.look === editLook)
							.map((entry) => (
								<TokenRow key={entry.key} entry={entry} write={write} />
							))}
						<div className="flex h-10 items-center gap-4 border-border border-t">
							<span className="w-[112px] shrink-0 font-mono text-text text-xs leading-xs">mark</span>
							<span className="min-w-0 flex-1 truncate text-muted text-sm leading-sm">
								The ribbon in the corner.
							</span>
							<span className="shrink-0 font-mono text-2xs text-muted/70 leading-3">follows thread</span>
							<Swatch value={tokens.thread} />
							<span className="w-[92px] shrink-0 pl-2.5 font-mono text-muted text-xs leading-xs">
								{tokens.thread}
							</span>
						</div>
					</div>
				) : null}
			</section>

			<p className="border-border border-t pt-5 text-muted text-sm leading-sm">
				A theme dresses spool’s chrome. Your frames render in documents of their own, on their own tokens.css, and
				nothing chosen here reaches inside one.
			</p>
		</div>
	);
}

/**
 * One look, drawn as spool's own canvas at thumbnail size on the values it
 * would actually show, so a moved token shows here first. System is the two
 * cut on the diagonal, which is what it is.
 */
function LookCard({
	look,
	selected,
	dark,
	light,
	onPick,
}: {
	look: Appearance;
	selected: boolean;
	dark: Record<ThemeToken, string>;
	light: Record<ThemeToken, string>;
	onPick: () => void;
}) {
	const name = look === "dark" ? "Dark" : look === "light" ? "Light" : "System";
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onPick}
			className={cn(
				"flex min-w-0 flex-1 flex-col gap-2.5 rounded-md border p-2.5 text-left transition-colors duration-150",
				selected ? "border-thread" : "border-border hover:border-border-raised",
			)}
		>
			<span className="relative block h-[84px] w-full overflow-hidden rounded-sm border border-border">
				<Thumb tokens={look === "light" ? light : dark} />
				{look === "system" ? (
					<span className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}>
						<Thumb tokens={light} />
					</span>
				) : null}
			</span>
			<span className="flex items-center justify-between px-0.5">
				<span className="text-base text-text leading-base">{name}</span>
				{selected ? <span className="h-1.5 w-1.5 rounded-full bg-thread" /> : null}
			</span>
		</button>
	);
}

/** A preset: its name over its own chrome at postage-stamp size. */
function PresetCard({ theme, selected, onPick }: { theme: ThemeSpec; selected: boolean; onPick: () => void }) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onPick}
			className={cn(
				"flex min-w-0 flex-col gap-2 rounded-md border p-1.5 text-left transition-colors duration-150",
				selected ? "border-thread" : "border-border hover:border-border-raised",
			)}
		>
			<span className="relative block h-[48px] w-full overflow-hidden rounded-xs border border-border">
				<Thumb tokens={theme.tokens} small />
			</span>
			<span className="flex items-center justify-between gap-2 px-1 pb-0.5">
				<span className="truncate text-sm text-text leading-sm">{theme.name}</span>
				{selected ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-thread" /> : null}
			</span>
		</button>
	);
}

function Thumb({ tokens, small = false }: { tokens: Record<ThemeToken, string>; small?: boolean }) {
	const at = (token: ThemeToken) => tokens[token];
	const rail = small ? 22 : 34;
	return (
		<span className="absolute inset-0 block" style={{ background: at("bg") }}>
			<span
				className="absolute inset-y-0 left-0 border-r"
				style={{ width: rail, background: at("surface"), borderColor: at("border") }}
			/>
			<span className="absolute top-0 right-0 bottom-0" style={{ left: rail, background: at("canvas") }} />
			<span
				className="absolute rounded-[3px] border"
				style={{
					top: small ? 9 : 16,
					left: rail + (small ? 8 : 14),
					height: small ? 16 : 28,
					width: small ? 22 : 36,
					background: at("surface"),
					borderColor: at("border-raised"),
				}}
			/>
			<span
				className="absolute rounded-[3px] border"
				style={{
					top: small ? 24 : 42,
					left: rail + (small ? 42 : 70),
					height: small ? 16 : 28,
					width: small ? 22 : 36,
					background: at("surface"),
					borderColor: at("border-raised"),
				}}
			/>
			<svg viewBox="0 0 200 84" className="absolute inset-0 h-full w-full" aria-hidden="true">
				<path
					d={small ? "M60 28c14 3 12 22 24 26" : "M84 30c14 3 12 22 20 26"}
					fill="none"
					stroke={at("thread")}
					strokeWidth={small ? 2.2 : 1.5}
					strokeLinecap="round"
				/>
			</svg>
			<span className="absolute" style={{ top: small ? 5 : 8, left: small ? 5 : 8, color: at("thread") }}>
				<RibbonMark className={small ? "h-2.5 w-2" : "h-3 w-2.5"} />
			</span>
			{small ? null : (
				<span
					className="absolute top-[9px] left-[22px] h-[6px] w-[8px] rounded-[1px]"
					style={{ background: at("muted") }}
				/>
			)}
		</span>
	);
}

/**
 * A theme out and a theme in, as text. Copy puts the theme on the clipboard;
 * Paste opens a field for one and applies it once it parses. Text rather than
 * a file because a theme is three hundred bytes, and the places people trade
 * them are chats and gists.
 */
function ShareTheme({ theme, onPaste }: { theme: ThemeSpec; onPaste: (theme: ThemeSpec) => void }) {
	const [copied, setCopied] = useState(false);
	const [pasting, setPasting] = useState(false);
	const [draft, setDraft] = useState("");
	const [reason, setReason] = useState<string | undefined>();
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 1400);
		return () => clearTimeout(timer);
	}, [copied]);

	const copy = () => {
		void navigator.clipboard?.writeText(printTheme(theme)).then(() => setCopied(true));
	};
	const submit = () => {
		const parsed = parseTheme(draft);
		if (!parsed.ok) {
			setReason(parsed.reason);
			return;
		}
		setReason(undefined);
		setDraft("");
		setPasting(false);
		onPaste(parsed.theme);
	};

	return (
		<span className="relative flex items-center gap-1">
			<TextButton onClick={copy}>{copied ? "Copied" : "Copy"}</TextButton>
			<TextButton lit={pasting} onClick={() => setPasting(!pasting)}>
				Paste
			</TextButton>
			{pasting ? (
				<span className="absolute top-8 right-0 z-20 flex w-[360px] animate-menu-in flex-col gap-2 rounded-md border border-border-raised bg-raised p-2">
					<textarea
						aria-label="Theme to paste"
						value={draft}
						spellCheck={false}
						placeholder={'{ "name": "…", "appearance": "dark", "tokens": { … } }'}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.stopPropagation();
								setPasting(false);
							}
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
						}}
						className="h-[120px] w-full resize-none rounded-sm border border-border bg-canvas px-2.5 py-2 font-mono text-text text-xs leading-xs outline-none placeholder:text-muted/50 focus:border-border-raised"
					/>
					{reason === undefined ? null : <Reason className="pt-0">{reason}</Reason>}
					<span className="flex items-center justify-between">
						<span className="font-mono text-2xs text-muted/70 leading-3">
							{accelLabel().replace(/\+$/, "")}↵ applies
						</span>
						<TextButton lit onClick={submit}>
							Apply
						</TextButton>
					</span>
				</span>
			) : null}
		</span>
	);
}

function TextButton({ children, lit = false, onClick }: { children: ReactNode; lit?: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-6 items-center rounded-sm border px-2 text-xs leading-xs transition-colors duration-150",
				lit
					? "border-border-raised bg-raised text-text"
					: "border-border text-muted hover:border-border-raised hover:text-text",
			)}
		>
			{children}
		</button>
	);
}

/**
 * The accent alone, first, because it is the one colour most people mean when
 * they say they want spool in their colour. A few that are known to read on
 * both looks, and a picker for any other.
 */
const ACCENTS: readonly { name: string; hex: string }[] = [
	{ name: "spool", hex: DARK_TOKENS.thread },
	{ name: "blue", hex: "#2f6fe0" },
	{ name: "violet", hex: "#7c5cff" },
	{ name: "pink", hex: "#e0409a" },
	{ name: "amber", hex: "#e8a317" },
	{ name: "green", hex: "#2fa864" },
	{ name: "teal", hex: "#1fa3a3" },
];

function AccentRow({ entry, write }: { entry: SettingReading & { value: string }; write: Write }) {
	const [reason, setReason] = useState<string | undefined>();
	const move = async (value: string | null) => {
		const written = await write(entry.key, value);
		setReason(written.ok ? undefined : written.reason);
	};
	const preset = ACCENTS.some((accent) => accent.hex === entry.value);
	return (
		<Row label="Thread" says={entry.says} reason={reason}>
			<span className="flex items-center gap-1.5">
				{ACCENTS.map((accent) => {
					const lit = entry.value === accent.hex;
					return (
						<button
							key={accent.hex}
							type="button"
							aria-label={accent.name}
							aria-pressed={lit}
							title={accent.name}
							onClick={() => void move(accent.hex === entry.fallback ? null : accent.hex)}
							className={cn(
								"flex h-6 w-6 items-center justify-center rounded-full border transition-[border-color,transform] duration-150 active:scale-90",
								lit ? "border-text" : "border-transparent hover:border-border-raised",
							)}
						>
							<span className="h-4 w-4 rounded-full" style={{ background: accent.hex }} />
						</button>
					);
				})}
				<span className="mx-1 h-4 w-px bg-border" />
				<ColourControl
					settingKey={entry.key}
					value={entry.value}
					label="Thread"
					lit={!preset}
					onChange={(next) => void move(next)}
					onRefuse={setReason}
				/>
			</span>
		</Row>
	);
}

function TokenRow({ entry, write }: { entry: SettingReading & { value: string }; write: Write }) {
	const [reason, setReason] = useState<string | undefined>();
	const move = async (value: string | null) => {
		const written = await write(entry.key, value);
		setReason(written.ok ? undefined : written.reason);
	};
	const moved = entry.source === "file";
	return (
		<div data-token={entry.key} className="flex flex-col border-border border-t">
			<div className="group flex h-10 items-center gap-4">
				<span className="w-[112px] shrink-0 font-mono text-text text-xs leading-xs">{entry.label}</span>
				<span className="min-w-0 flex-1 truncate text-muted text-sm leading-sm">{entry.says}</span>
				{moved ? (
					<button
						type="button"
						onClick={() => void move(null)}
						className="shrink-0 font-mono text-2xs text-muted/70 leading-3 opacity-0 transition-opacity duration-150 hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
					>
						reset
					</button>
				) : null}
				<ColourControl
					settingKey={entry.key}
					value={entry.value}
					label={entry.label}
					lit={moved}
					onChange={(next) => void move(next)}
					onRefuse={setReason}
				/>
			</div>
			{reason === undefined ? null : <Reason className="pb-3">{reason}</Reason>}
		</div>
	);
}

/* ---------------------------------------------------------------- controls -- */

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (next: boolean) => void }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			onClick={() => onChange(!on)}
			className={cn(
				"flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors duration-150",
				on ? "border-thread bg-thread" : "border-border-raised bg-raised hover:border-muted/50",
			)}
		>
			<span
				className={cn(
					"h-2.5 w-2.5 rounded-full transition-[translate,background-color] duration-150 ease-out",
					on ? "translate-x-[14px] bg-on-thread" : "translate-x-[2px] bg-muted",
				)}
			/>
		</button>
	);
}

function Segmented({
	choices,
	value,
	label,
	onChange,
}: {
	choices: readonly string[];
	value: string;
	label: string;
	onChange: (next: string) => void;
}) {
	return (
		<span className="flex h-7 items-stretch rounded-sm border border-border p-px">
			{choices.map((choice) => {
				const lit = choice === value;
				return (
					<button
						key={choice}
						type="button"
						aria-label={`${label}: ${choice}`}
						aria-pressed={lit}
						onClick={() => onChange(choice)}
						className={cn(
							"flex items-center rounded-[5px] px-2.5 font-mono text-xs leading-xs transition-colors duration-150",
							lit ? "bg-raised text-text" : "text-muted hover:text-text",
						)}
					>
						{choice}
					</button>
				);
			})}
		</span>
	);
}

/**
 * A colour: the swatch is the OS's own picker behind it, writing as it drags
 * on a short trailing debounce, and the field is the hex, written on enter or
 * blur, only when the registry would take it. A field that would be refused
 * says so and goes back to the file's value.
 */
function ColourControl({
	settingKey,
	value,
	label,
	lit = false,
	onChange,
	onRefuse,
}: {
	settingKey: SettingKey;
	value: string;
	label: string;
	/** drawn as the one that is in play, the way a moved token is */
	lit?: boolean;
	onChange: (next: string) => void;
	/** a hex the registry would refuse never reaches the daemon; the reason is the registry's own */
	onRefuse?: ((reason: string) => void) | undefined;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const [refused, setRefused] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	const commit = () => {
		if (draft === null) return;
		const parsed = parseSetting(settingKey, draft);
		setDraft(null);
		if (!parsed.ok) {
			setRefused(true);
			onRefuse?.(parsed.reason);
			return;
		}
		setRefused(false);
		if (parsed.value !== value) onChange(parsed.value as string);
	};

	return (
		<span className="flex shrink-0 items-center gap-2">
			<Swatch value={value} lit={lit}>
				<input
					type="color"
					aria-label={`${label} picker`}
					value={value}
					onChange={(event) => {
						const next = event.target.value.toLowerCase();
						clearTimeout(timer.current);
						timer.current = setTimeout(() => onChange(next), 100);
					}}
					className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
				/>
			</Swatch>
			<span
				className={cn(
					"flex h-7 w-[92px] shrink-0 items-center rounded-sm border bg-canvas px-2.5 transition-colors duration-150",
					refused ? "border-thread" : "border-border focus-within:border-border-raised hover:border-border-raised",
				)}
			>
				<input
					type="text"
					aria-label={label}
					aria-invalid={refused || undefined}
					value={draft ?? value}
					spellCheck={false}
					onFocus={() => setRefused(false)}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
						} else if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							setDraft(null);
							event.currentTarget.blur();
						}
					}}
					className="w-full bg-transparent font-mono text-text text-xs leading-xs outline-none"
				/>
			</span>
		</span>
	);
}

function Swatch({ value, lit = false, children }: { value: string; lit?: boolean; children?: ReactNode }) {
	return (
		<span
			className={cn(
				"relative flex h-5 w-5 shrink-0 overflow-hidden rounded-xs border transition-colors duration-150",
				lit ? "border-text/60" : "border-border-raised",
			)}
			style={{ background: value }}
		>
			{children}
		</span>
	);
}

/* ------------------------------------------------------------------- parts -- */

function Band({
	name,
	file,
	aside,
	children,
}: {
	name: string;
	file: string;
	aside?: ReactNode | undefined;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col">
			<div className="flex h-6 items-center justify-between gap-6">
				<span className="flex items-baseline gap-2.5">
					<span className="font-medium text-md text-text leading-md">{name}</span>
					<span className="font-mono text-2xs text-muted/70 leading-3">{file}</span>
				</span>
				{aside}
			</div>
			<div className="flex flex-col pt-1">{children}</div>
		</section>
	);
}

function Row({
	label,
	says,
	reason,
	children,
}: {
	label: string;
	says: ReactNode;
	reason?: string | undefined;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col border-border border-t py-3.5">
			<div className="flex items-start justify-between gap-10">
				<span className="flex min-w-0 flex-col gap-1">
					<span className="text-base text-text leading-base">{label}</span>
					<span className="max-w-[440px] text-muted text-sm leading-sm">{says}</span>
				</span>
				<span className="flex shrink-0 items-center gap-2 pt-0.5">{children}</span>
			</div>
			{reason === undefined ? null : <Reason>{reason}</Reason>}
		</div>
	);
}

/** The daemon's refusal, in its own words, under the row that asked. */
function Reason({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span role="alert" className={cn("pt-2 font-mono text-2xs text-thread leading-3", className)}>
			{children}
		</span>
	);
}

function Chevron({ open }: { open: boolean }) {
	return (
		<svg
			viewBox="0 0 12 12"
			aria-hidden="true"
			fill="none"
			className={cn("h-2.5 w-2.5 shrink-0 text-muted transition-transform duration-150", open ? "rotate-90" : "")}
		>
			<path
				d="M4.5 2.5 8 6l-3.5 3.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** The face the dock's cog wears in its tooltip, from the register. */
export function settingsHotkeyFace(): string {
	return hotkeyKey("app.settings");
}
