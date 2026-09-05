import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { Field, Switch } from "shared/ui/explore/settings/controls";
import { COLOUR_TOKENS, type ColourToken, colourOf } from "shared/ui/explore/settings/tokens";
import { ChevronIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * The settings panel (#267): everything a person is allowed to change, in one
 * surface. Three takes host it, and the panel is the same panel in all three,
 * which is what makes the question legible: the argument is where it stands,
 * not what it holds.
 *
 * Two tabs. Experiments is gone, because nothing is behind one any more.
 *
 * The scope split is drawn as two bands rather than a chip on every row, and
 * each band is headed by the file the change lands in. `design/canvas.json` is
 * the project's, `~/.spool/config.json` is the machine's, and a person reading
 * a filename knows the precedence without a word about precedence.
 */

export type SettingsTab = "general" | "theme";
/**
 * Which project the project band is about. `current` is the canvas you came
 * from; `pick` is a surface with no canvas behind it, which has to name one.
 */
export type SettingsScope = "current" | "pick";

export interface SettingsSeed {
	tab?: SettingsTab | undefined;
	customize?: boolean | undefined;
	/** colours the person has changed, by token name */
	colours?: Readonly<Record<string, string>> | undefined;
	/** the token whose field the caret is in */
	editing?: string | undefined;
}

export interface Settings {
	tab: SettingsTab;
	setTab: (tab: SettingsTab) => void;
	customize: boolean;
	setCustomize: (open: boolean) => void;
	colours: Readonly<Record<string, string>>;
	setColour: (token: string, value: string) => void;
	reset: () => void;
	editing: string | undefined;
	setEditing: (token: string | undefined) => void;
	history: boolean;
	setHistory: (on: boolean) => void;
	updates: boolean;
	setUpdates: (on: boolean) => void;
	login: boolean;
	setLogin: (on: boolean) => void;
	host: string;
	setHost: (value: string) => void;
	port: string;
	setPort: (value: string) => void;
	project: string;
	setProject: (name: string) => void;
	/** the changed tokens as variable overrides, for whatever the theme should dress */
	style: CSSProperties;
}

/**
 * The whole surface's state, held by the host rather than by the panel, because
 * a changed colour has to reach further than the panel: the sheet take dresses
 * the canvas standing behind it, and that is the only honest preview.
 */
export function useSettings(seed: SettingsSeed = {}): Settings {
	const [tab, setTab] = useState<SettingsTab>(seed.tab ?? "general");
	const [customize, setCustomize] = useState(seed.customize ?? false);
	const [colours, setColours] = useState<Readonly<Record<string, string>>>(seed.colours ?? {});
	const [editing, setEditing] = useState<string | undefined>(seed.editing);
	const [history, setHistory] = useState(false);
	const [updates, setUpdates] = useState(true);
	const [login, setLogin] = useState(false);
	const [host, setHost] = useState("127.0.0.1");
	const [port, setPort] = useState("7767");
	const [project, setProject] = useState("spool");

	const style: CSSProperties = {};
	for (const [name, value] of Object.entries(colours)) {
		(style as Record<string, string>)[`--color-${name}`] = value;
	}

	return {
		tab,
		setTab,
		customize,
		setCustomize,
		colours,
		setColour: (token, value) => setColours((prev) => ({ ...prev, [token]: value })),
		reset: () => {
			setColours({});
			setEditing(undefined);
		},
		editing,
		setEditing,
		history,
		setHistory,
		updates,
		setUpdates,
		login,
		setLogin,
		host,
		setHost,
		port,
		setPort,
		project,
		setProject,
		style,
	};
}

export const PROJECTS = ["spool", "tidemark", "notaker"] as const;

export function SettingsPanel({
	settings,
	scope,
	tabs = true,
}: {
	settings: Settings;
	scope: SettingsScope;
	/** the panel draws its own tab row unless the host has somewhere better for it */
	tabs?: boolean | undefined;
}) {
	const body = useRef<HTMLDivElement | null>(null);
	// the field the caret is in has to be on screen: a token list is longer than
	// any of these surfaces, and an edit nobody can see is not an edit
	useEffect(() => {
		if (settings.editing === undefined) return;
		body.current?.querySelector(`[data-token="${settings.editing}"]`)?.scrollIntoView({ block: "center" });
	}, [settings.editing]);

	return (
		<div className="flex h-full min-h-0 flex-col" style={settings.style}>
			{tabs ? <TabRow tab={settings.tab} onTab={settings.setTab} /> : null}
			<div ref={body} className="min-h-0 flex-1 overflow-y-auto px-7 pt-5 pb-8">
				{settings.tab === "general" ? <General settings={settings} scope={scope} /> : <Theme settings={settings} />}
			</div>
		</div>
	);
}

export function TabRow({
	tab,
	onTab,
	className,
}: {
	tab: SettingsTab;
	onTab: (tab: SettingsTab) => void;
	className?: string | undefined;
}) {
	return (
		<div className={cn("flex h-10 shrink-0 items-stretch gap-6 border-border border-b px-7", className)}>
			{(["general", "theme"] as const).map((candidate) => (
				<button
					key={candidate}
					type="button"
					onClick={() => onTab(candidate)}
					className={cn(
						"relative flex items-center text-base leading-base",
						tab === candidate ? "text-text" : "text-muted hover:text-text",
					)}
				>
					{candidate === "general" ? "General" : "Theme"}
					{tab === candidate ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
				</button>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ general -- */

function General({ settings, scope }: { settings: Settings; scope: SettingsScope }) {
	return (
		<div className="flex flex-col gap-9">
			<Band
				name="This project"
				file="design/canvas.json"
				aside={
					scope === "pick" ? (
						<ProjectPicker project={settings.project} onPick={settings.setProject} />
					) : (
						<span className="font-mono text-muted text-xs leading-xs">{settings.project}</span>
					)
				}
			>
				<Row
					label="History"
					says={
						<>
							spool commits <Mono>design/</Mono> for you once the canvas has been quiet for 45 seconds. Off, your
							agents commit their own work.
						</>
					}
				>
					<Switch on={settings.history} label="History" onChange={settings.setHistory} />
				</Row>
			</Band>

			<Band name="This machine" file="~/.spool/config.json">
				<Row label="Update checks" says="spool asks GitHub for the latest release when the daemon starts.">
					<Switch on={settings.updates} label="Update checks" onChange={settings.setUpdates} />
				</Row>
				<Row
					label="Open at login"
					says="macOS only. The daemon comes up with your session, so a project’s tab answers the first time you ask for it."
				>
					<Switch on={settings.login} label="Open at login" onChange={settings.setLogin} />
				</Row>
				<Row label="Host and port" says="A change takes effect when the daemon restarts.">
					<Field value={settings.host} label="Host" width={124} onChange={settings.setHost} />
					<Field value={settings.port} label="Port" width={68} onChange={settings.setPort} />
				</Row>
				<p className="pt-4 text-muted/80 text-sm leading-sm">
					spool writes this file when something here moves. Every other key in it is left the way you typed it.
				</p>
			</Band>
		</div>
	);
}

/* -------------------------------------------------------------------- theme -- */

function Theme({ settings }: { settings: Settings }) {
	const changed = Object.keys(settings.colours).length;
	return (
		<div className="flex flex-col gap-9">
			<Band name="Appearance" file="~/.spool/config.json">
				<div className="flex gap-4 pt-4">
					<Appearance name="Dark" note="shipped" selected>
						<DarkPreview colours={settings.colours} />
					</Appearance>
					<Appearance name="Light" note="not yet" selected={false}>
						<LightPreview />
					</Appearance>
				</div>
				<p className="pt-5 text-muted text-sm leading-sm">
					Light is authored one value at a time. Eleven colours picked for a dark chrome do not invert into a light
					one, so the option stands here while the values are still being chosen.
				</p>
			</Band>

			<section className="flex flex-col">
				<button
					type="button"
					onClick={() => settings.setCustomize(!settings.customize)}
					className="flex h-6 items-center gap-2 text-left"
				>
					<ChevronIcon open={settings.customize} className="h-2.5 w-2.5 shrink-0 text-muted" />
					<span className="font-medium text-md text-text leading-md">Customize</span>
					<span className="font-mono text-2xs text-muted leading-3">11 tokens</span>
				</button>
				<div className="flex items-baseline justify-between gap-6 pt-1.5 pl-[18px]">
					<p className="max-w-[440px] text-muted text-sm leading-sm">
						The interface’s own colours. The chrome is built on these eleven, so they are the whole of what a
						theme can move.
					</p>
					<button
						type="button"
						disabled={changed === 0}
						onClick={settings.reset}
						className={cn("shrink-0 text-sm leading-sm", changed === 0 ? "text-muted/40" : "text-thread")}
					>
						Reset to spool’s
					</button>
				</div>
				{settings.customize ? (
					<div className="flex flex-col pt-4">
						{COLOUR_TOKENS.map((token) => (
							<TokenRow key={token.name} token={token} settings={settings} />
						))}
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

function TokenRow({ token, settings }: { token: ColourToken; settings: Settings }) {
	const value = colourOf(token, settings.colours);
	const editing = settings.editing === token.name;
	return (
		<div data-token={token.name} className="flex h-10 items-center gap-4 border-border border-t">
			<span className="w-[112px] shrink-0 font-mono text-text text-xs leading-xs">{token.name}</span>
			<span className="min-w-0 flex-1 truncate text-muted text-sm leading-sm">{token.paints}</span>
			{token.follows === undefined ? null : (
				<span className="shrink-0 font-mono text-2xs text-muted/70 leading-3">follows {token.follows}</span>
			)}
			<span className="h-4 w-4 shrink-0 rounded-xs border border-border-raised" style={{ background: value }} />
			<Field
				value={value}
				label={token.name}
				width={92}
				editing={editing}
				onChange={(next) => settings.setColour(token.name, next)}
			/>
		</div>
	);
}

function Appearance({
	name,
	note,
	selected,
	children,
}: {
	name: string;
	note: string;
	selected: boolean;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			className={cn(
				"flex w-[236px] flex-col gap-3 rounded-md border p-3 text-left transition-colors duration-150",
				selected ? "border-thread" : "border-border hover:border-border-raised",
			)}
		>
			{children}
			<span className="flex items-center justify-between">
				<span className="text-base text-text leading-base">{name}</span>
				<span className="font-mono text-2xs text-muted leading-3">{note}</span>
			</span>
		</button>
	);
}

/** spool's own canvas at thumbnail size, drawn on the live values so an edit shows here first. */
function DarkPreview({ colours }: { colours: Readonly<Record<string, string>> }) {
	const at = (name: string) => {
		const token = COLOUR_TOKENS.find((candidate) => candidate.name === name);
		return token === undefined ? "#000" : colourOf(token, colours);
	};
	return (
		<span className="relative block h-[92px] w-full overflow-hidden rounded-sm" style={{ background: at("bg") }}>
			<span
				className="absolute inset-y-0 left-0 w-[38px] border-r"
				style={{ background: at("surface"), borderColor: at("border") }}
			/>
			<span className="absolute top-0 right-0 bottom-0 left-[38px]" style={{ background: at("canvas") }} />
			<span
				className="absolute top-[18px] left-[54px] h-[30px] w-[38px] rounded-[3px] border"
				style={{ background: at("surface"), borderColor: at("border-raised") }}
			/>
			<span
				className="absolute top-[44px] left-[112px] h-[30px] w-[38px] rounded-[3px] border"
				style={{ background: at("surface"), borderColor: at("border-raised") }}
			/>
			<svg viewBox="0 0 212 92" className="absolute inset-0 h-full w-full" aria-hidden="true">
				<path
					d="M92 33c14 3 12 22 20 26"
					fill="none"
					stroke={at("thread")}
					strokeWidth="1.5"
					strokeLinecap="round"
				/>
			</svg>
			<span className="absolute top-[9px] left-[9px]" style={{ color: at("mark") }}>
				<SpoolMark className="h-3 w-2.5" />
			</span>
		</span>
	);
}

/** The same picture with nothing filled in, because light is an option rather than a rendering. */
function LightPreview() {
	return (
		<span className="relative flex h-[92px] w-full items-center justify-center overflow-hidden rounded-sm border border-border bg-bg">
			<span className="font-mono text-2xs text-muted/60 leading-3">not drawn yet</span>
		</span>
	);
}

/* ------------------------------------------------------------------- parts -- */

function DownCaret() {
	return (
		<svg viewBox="0 0 12 12" className="h-2 w-2 text-muted" fill="none" aria-hidden="true">
			<path
				d="M2.5 4.5 6 8l3.5-3.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** something the machine would print, set inside a sentence a person is saying */
function Mono({ children }: { children: ReactNode }) {
	return <span className="font-mono text-[11px] text-muted">{children}</span>;
}

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

function Row({ label, says, children }: { label: string; says: ReactNode; children: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-10 border-border border-t py-3.5">
			<span className="flex min-w-0 flex-col gap-1">
				<span className="text-base text-text leading-base">{label}</span>
				<span className="max-w-[460px] text-muted text-sm leading-sm">{says}</span>
			</span>
			<span className="flex shrink-0 items-center gap-2 pt-0.5">{children}</span>
		</div>
	);
}

/**
 * A surface with no canvas behind it has to name the project it is talking
 * about, so the project band grows a picker. Nothing else about the band moves.
 */
function ProjectPicker({ project, onPick }: { project: string; onPick: (name: string) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<span className="relative">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className={cn(
					"flex h-6 items-center gap-2 rounded-sm border px-2 font-mono text-xs leading-xs transition-colors duration-150",
					open ? "border-border-raised bg-raised text-text" : "border-border text-text hover:border-border-raised",
				)}
			>
				{project}
				<DownCaret />
			</button>
			{open ? (
				<span className="absolute top-7 right-0 z-20 flex w-[164px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit">
					{PROJECTS.map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => {
								onPick(name);
								setOpen(false);
							}}
							className={cn(
								"flex h-7 items-center rounded-sm px-2.5 text-left font-mono text-xs leading-xs hover:bg-surface",
								name === project ? "text-text" : "text-muted",
							)}
						>
							{name}
						</button>
					))}
				</span>
			) : null}
		</span>
	);
}
