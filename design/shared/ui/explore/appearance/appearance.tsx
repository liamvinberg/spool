import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { SpoolCanvasScreen } from "shared/ui/spool/canvas-screen";
import { EditIcon, HandIcon, SelectIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import "./appearance.css";

// Prototype: compare three settings layouts, each in its own live frame.
// All changes stay in this frame. The chosen layout will be implemented separately.
type Mode = "Dark" | "Light" | "System";
type Layout = "compact" | "preview" | "simple";
const TOKEN_LABELS = {
	bg: "Background",
	canvas: "Canvas",
	surface: "Panels",
	raised: "Raised surfaces",
	border: "Borders",
	"border-raised": "Strong borders",
	text: "Text",
	muted: "Muted text",
	thread: "Accent",
	"on-thread": "Text on accent",
};
type ColourToken = keyof typeof TOKEN_LABELS;
type Colours = Record<ColourToken, string>;
type Look = "dark" | "light";
interface Theme {
	name: string;
	font: string;
	code: string;
	size: string;
	dark: Colours;
	light: Colours;
}
const FONTS = ["Inter", "Familjen Grotesk", "System"];
const CODE_FONTS = ["Fragment Mono", "System mono"];
const SIZES = ["90%", "100%", "110%", "125%"];
const FONT_STACKS: Record<string, string> = {
	Inter: '"Inter", system-ui, sans-serif',
	"Familjen Grotesk": '"Familjen Grotesk", system-ui, sans-serif',
	System: "system-ui, sans-serif",
	"Fragment Mono": '"Fragment Mono", ui-monospace, monospace',
	"System mono": "ui-monospace, SFMono-Regular, monospace",
};
const TOKEN_NAMES = Object.keys(TOKEN_LABELS) as ColourToken[];
const palette = (
	values: readonly [string, string, string, string, string, string, string, string, string, string],
): Colours => ({
	bg: values[0],
	canvas: values[1],
	surface: values[2],
	raised: values[3],
	border: values[4],
	"border-raised": values[5],
	text: values[6],
	muted: values[7],
	thread: values[8],
	"on-thread": values[9],
});
const THEMES: readonly Theme[] = [
	{
		name: "Spool",
		font: "Familjen Grotesk",
		code: "Fragment Mono",
		size: "100%",
		dark: palette([
			"#0e0e0e",
			"#161616",
			"#1c1c1c",
			"#282828",
			"#262626",
			"#363636",
			"#f0efed",
			"#8e8c88",
			"#f5391a",
			"#ffffff",
		]),
		light: palette([
			"#f0efec",
			"#e6e5e1",
			"#ffffff",
			"#ffffff",
			"#dcdad5",
			"#c2c0ba",
			"#1a1917",
			"#6f6c68",
			"#f5391a",
			"#ffffff",
		]),
	},
	{
		name: "Figma",
		font: "Inter",
		code: "Fragment Mono",
		size: "100%",
		dark: palette([
			"#2c2c2c",
			"#1e1e1e",
			"#2c2c2c",
			"#383838",
			"#383838",
			"#444444",
			"#ffffff",
			"#b3b3b3",
			"#0d99ff",
			"#ffffff",
		]),
		light: palette([
			"#ffffff",
			"#e5e5e5",
			"#ffffff",
			"#f5f5f5",
			"#e6e6e6",
			"#b3b3b3",
			"#1e1e1e",
			"#767676",
			"#0d99ff",
			"#ffffff",
		]),
	},
	{
		name: "Mono",
		font: "Familjen Grotesk",
		code: "Fragment Mono",
		size: "100%",
		dark: palette([
			"#000000",
			"#0a0a0a",
			"#111111",
			"#1f1f1f",
			"#1f1f1f",
			"#333333",
			"#ffffff",
			"#888888",
			"#ffffff",
			"#000000",
		]),
		light: palette([
			"#ffffff",
			"#f5f5f5",
			"#ffffff",
			"#eeeeee",
			"#eeeeee",
			"#cccccc",
			"#111111",
			"#737373",
			"#111111",
			"#ffffff",
		]),
	},
	{
		name: "Nord",
		font: "Familjen Grotesk",
		code: "Fragment Mono",
		size: "100%",
		dark: palette([
			"#242933",
			"#2e3440",
			"#3b4252",
			"#434c5e",
			"#434c5e",
			"#4c566a",
			"#eceff4",
			"#a3adc2",
			"#88c0d0",
			"#2e3440",
		]),
		light: palette([
			"#d8dee9",
			"#e5e9f0",
			"#eceff4",
			"#ffffff",
			"#d8dee9",
			"#b8c5d6",
			"#2e3440",
			"#4c566a",
			"#5e81ac",
			"#ffffff",
		]),
	},
	{
		name: "Tokyo Night",
		font: "Familjen Grotesk",
		code: "Fragment Mono",
		size: "100%",
		dark: palette([
			"#16161e",
			"#1a1b26",
			"#1f2335",
			"#292e42",
			"#292e42",
			"#414868",
			"#c0caf5",
			"#7982a9",
			"#7aa2f7",
			"#16161e",
		]),
		light: palette([
			"#d5d6db",
			"#e1e2e7",
			"#e9e9ed",
			"#ffffff",
			"#d5d6db",
			"#b4b5b9",
			"#343b58",
			"#6c6e75",
			"#34548a",
			"#ffffff",
		]),
	},
];
const HEX = /^#[0-9a-f]{6}$/i;
function parseCustomTheme(raw: string): Theme {
	const value: unknown = JSON.parse(raw);
	if (
		typeof value !== "object" ||
		value === null ||
		!("name" in value) ||
		typeof value.name !== "string" ||
		!value.name.trim()
	)
		throw new Error("Give the theme a name.");
	if (!("font" in value) || typeof value.font !== "string" || !FONTS.includes(value.font))
		throw new Error("Choose an available interface font.");
	if (!("code" in value) || typeof value.code !== "string" || !CODE_FONTS.includes(value.code))
		throw new Error("Choose an available code font.");
	if (!("size" in value) || typeof value.size !== "string" || !SIZES.includes(value.size))
		throw new Error("Choose an available interface size.");
	function readColours(raw: unknown, look: Look): Colours {
		if (typeof raw !== "object" || raw === null) throw new Error(`The ${look} colours are missing.`);
		const values = raw as Record<string, unknown>;
		if (Object.keys(values).some((key) => !TOKEN_NAMES.includes(key as ColourToken)))
			throw new Error(`Unknown colour token in ${look}.`);
		const colours = {} as Colours;
		for (const token of TOKEN_NAMES) {
			const colour = values[token];
			if (typeof colour !== "string" || !HEX.test(colour))
				throw new Error(`${look}.${token} needs a six-digit hex colour.`);
			colours[token] = colour.toLowerCase();
		}
		return colours;
	}
	return {
		name: value.name.trim(),
		font: value.font,
		code: value.code,
		size: value.size,
		dark: readColours("dark" in value ? value.dark : undefined, "dark"),
		light: readColours("light" in value ? value.light : undefined, "light"),
	};
}

function useAppearance() {
	const initial = THEMES.find((theme) => theme.name === "Figma")!;
	const [themes, setThemes] = useState(THEMES);
	const [base, setBase] = useState(initial);
	const [current, setCurrent] = useState(initial);
	const [mode, setMode] = useState<Mode>("Dark");
	const [systemDark, setSystemDark] = useState(true);
	useEffect(() => {
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const update = () => setSystemDark(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	const look: Look = mode === "Dark" || (mode === "System" && systemDark) ? "dark" : "light";
	const colours = current[look];
	const pick = (name: string) => {
		const theme = themes.find((entry) => entry.name === name);
		if (theme) {
			setBase(theme);
			setCurrent(theme);
		}
	};
	const save = (theme: Theme) => {
		if (THEMES.some((preset) => preset.name === theme.name))
			throw new Error("Choose a new name to keep the built-in preset.");
		setThemes((all) => [...all.filter((entry) => entry.name !== theme.name), theme]);
		setBase(theme);
		setCurrent(theme);
	};
	const setToken = (token: ColourToken, value: string) =>
		setCurrent((held) => ({ ...held, [look]: { ...held[look], [token]: value } }));
	const style = {
		...Object.fromEntries(TOKEN_NAMES.map((token) => [`--color-${token}`, colours[token]])),
		"--font-sans": FONT_STACKS[current.font],
		"--font-mono": FONT_STACKS[current.code],
		"--appearance-scale": Number.parseInt(current.size, 10) / 100,
		colorScheme: look,
	} as CSSProperties;
	return {
		theme: current.name,
		themes,
		base,
		current,
		look,
		colours,
		mode,
		font: current.font,
		code: current.code,
		size: current.size,
		accent: colours.thread,
		changed: JSON.stringify(current) !== JSON.stringify(base),
		style,
		setMode,
		pick,
		save,
		setToken,
		setFont: (font: string) => setCurrent((held) => ({ ...held, font })),
		setCode: (code: string) => setCurrent((held) => ({ ...held, code })),
		setSize: (size: string) => setCurrent((held) => ({ ...held, size })),
		setAccent: (value: string) => setToken("thread", value),
	};
}
type Appearance = ReturnType<typeof useAppearance>;

function Select({
	label,
	value,
	choices,
	onChange,
}: {
	label: string;
	value: string;
	choices: readonly string[];
	onChange: (value: string) => void;
}) {
	return (
		<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
			{choices.map((choice) => (
				<option key={choice}>{choice}</option>
			))}
		</select>
	);
}

function ModePicker({ state }: { state: Appearance }) {
	return (
		<div className="appearance-segment" aria-label="Colour mode">
			{(["Light", "Dark", "System"] as const).map((mode) => (
				<button key={mode} type="button" aria-pressed={state.mode === mode} onClick={() => state.setMode(mode)}>
					{mode}
				</button>
			))}
		</div>
	);
}

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
	return (
		<div className="appearance-row">
			<div>
				<div>{label}</div>
				{description ? <p>{description}</p> : null}
			</div>
			{children}
		</div>
	);
}

function ThemePicker({ state }: { state: Appearance }) {
	return (
		<Select label="Theme" value={state.theme} choices={state.themes.map((theme) => theme.name)} onChange={state.pick} />
	);
}

function FontRows({ state }: { state: Appearance }) {
	return (
		<>
			<Row label="Interface font">
				<Select label="Interface font" value={state.font} choices={FONTS} onChange={state.setFont} />
			</Row>
			<Row label="Code font" description="Code, paths, and shortcuts.">
				<Select label="Code font" value={state.code} choices={CODE_FONTS} onChange={state.setCode} />
			</Row>
			<Row label="Interface size" description="Text and controls scale together.">
				<Select label="Interface size" value={state.size} choices={SIZES} onChange={state.setSize} />
			</Row>
		</>
	);
}

function Accent({ state }: { state: Appearance }) {
	return (
		<Row label="Accent">
			<div className="appearance-accent">
				<input
					type="color"
					aria-label="Accent colour"
					value={state.accent}
					onChange={(event) => state.setAccent(event.target.value)}
				/>
				<span>{state.accent.toUpperCase()}</span>
			</div>
		</Row>
	);
}

function Reset({ state }: { state: Appearance }) {
	return (
		<button
			type="button"
			className="appearance-reset"
			disabled={!state.changed}
			onClick={() => state.pick(state.theme)}
		>
			Reset to {state.theme}
		</button>
	);
}

function ColourField({ token, state }: { token: ColourToken; state: Appearance }) {
	const value = state.colours[token];
	const fallback = state.base[state.look][token];
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	const label = TOKEN_LABELS[token];
	return (
		<div className="appearance-token">
			<div className="appearance-token-name">
				<span>{label}</span>
				<code>{token}</code>
			</div>
			<div className="appearance-token-value">
				<input
					type="color"
					aria-label={`${label} colour`}
					value={value}
					onChange={(event) => state.setToken(token, event.target.value)}
				/>
				<input
					type="text"
					aria-label={`${label} hex`}
					aria-invalid={!HEX.test(draft)}
					value={draft}
					spellCheck={false}
					onChange={(event) => {
						const text = event.target.value;
						setDraft(text);
						if (HEX.test(text)) state.setToken(token, text.toLowerCase());
					}}
					onBlur={() => setDraft(value)}
				/>
			</div>
			<button
				type="button"
				aria-label={`Reset ${label}`}
				disabled={value === fallback}
				onClick={() => state.setToken(token, fallback)}
			>
				↺
			</button>
		</div>
	);
}

function Advanced({ state, initiallyOpen = false }: { state: Appearance; initiallyOpen?: boolean }) {
	const [open, setOpen] = useState(initiallyOpen);
	const [action, setAction] = useState<"save" | "paste" | "copy" | null>(null);
	const [name, setName] = useState("");
	const [draft, setDraft] = useState("");
	const [reason, setReason] = useState("");
	const [copied, setCopied] = useState(false);
	const serialized = () => JSON.stringify(state.current, null, 2);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(serialized());
			setCopied(true);
		} catch {
			setDraft(serialized());
			setAction("copy");
			setOpen(true);
		}
	};
	const apply = () => {
		try {
			if (action === "save") {
				if (!name.trim()) throw new Error("Give the theme a name.");
				state.save({ ...state.current, name: name.trim() });
			} else {
				const imported = parseCustomTheme(draft);
				state.save({
					...imported,
					name: THEMES.some((theme) => theme.name === imported.name) ? `${imported.name} custom` : imported.name,
				});
			}
			setAction(null);
			setReason("");
		} catch (error) {
			setReason(error instanceof Error ? error.message : "Could not read this theme.");
		}
	};
	return (
		<section className="appearance-advanced">
			<div className="appearance-advanced-header">
				<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
					Advanced <span>{open ? "⌃" : "⌄"}</span>
				</button>
				<span>{state.changed ? "Customized" : ""}</span>
			</div>
			{open ? (
				<>
					<div className="appearance-token-heading">
						<strong>Colours</strong>
						<div className="appearance-segment" aria-label="Colours to edit">
							{(["light", "dark"] as const).map((look) => (
								<button
									key={look}
									type="button"
									aria-pressed={state.look === look}
									onClick={() => state.setMode(look === "light" ? "Light" : "Dark")}
								>
									{look === "light" ? "Light" : "Dark"}
								</button>
							))}
						</div>
					</div>
					<div className="appearance-token-grid">
						{TOKEN_NAMES.map((token) => (
							<ColourField key={`${state.look}.${token}`} token={token} state={state} />
						))}
					</div>
					<p className="appearance-note">Each mode keeps its own colours. Fonts and interface size are shared.</p>
				</>
			) : null}
			<div className="appearance-theme-actions">
				<button
					type="button"
					onClick={() => {
						setName(`${state.theme} custom`);
						setAction("save");
						setReason("");
					}}
				>
					Save as theme
				</button>
				<button type="button" onClick={() => void copy()}>
					{copied ? "Copied" : "Copy theme"}
				</button>
				<button
					type="button"
					onClick={() => {
						setDraft("");
						setAction("paste");
						setReason("");
					}}
				>
					Paste theme
				</button>
			</div>
			{action ? (
				<div className="appearance-theme-editor">
					{action === "save" ? (
						<input aria-label="Theme name" value={name} onChange={(event) => setName(event.target.value)} />
					) : (
						<textarea
							aria-label={action === "paste" ? "Theme to paste" : "Theme to copy"}
							value={draft}
							readOnly={action === "copy"}
							onChange={(event) => setDraft(event.target.value)}
							onFocus={(event) => {
								if (action === "copy") event.target.select();
							}}
							placeholder="Paste theme JSON"
							spellCheck={false}
						/>
					)}
					{reason ? <p role="alert">{reason}</p> : null}
					<div>
						<button type="button" onClick={() => setAction(null)}>
							Cancel
						</button>
						{action !== "copy" ? (
							<button type="button" onClick={apply}>
								{action === "save" ? "Save theme" : "Apply theme"}
							</button>
						) : null}
					</div>
				</div>
			) : null}
		</section>
	);
}

function Preview({ state, wide = false }: { state: Appearance; wide?: boolean }) {
	const [selected, setSelected] = useState("home");
	const [tool, setTool] = useState("Select");
	return (
		<div className="appearance-sample" data-wide={wide} aria-label="Interface preview" style={state.style}>
			<div className="appearance-sample-header">
				<SpoolMark className="appearance-mark" />
				<span>spool</span>
				<span className="appearance-sample-percent">72%</span>
			</div>
			<div className="appearance-sample-workspace">
				<div className="appearance-sample-sidebar">
					<strong>Pages</strong>
					<span>⌄ &nbsp; app</span>
					{["home", "details", "settings"].map((name) => (
						<button type="button" key={name} aria-pressed={selected === name} onClick={() => setSelected(name)}>
							<span>▧</span>
							{name}
						</button>
					))}
					<code>frame.tsx</code>
				</div>
				<div className="appearance-sample-canvas">
					<div className="appearance-sample-frame">
						<span>{selected}</span>
						<div>
							<div />
							<div />
							<div />
						</div>
						<small>390 × 844</small>
					</div>
					<div className="appearance-sample-tools">
						{[
							{ name: "Select", Icon: SelectIcon },
							{ name: "Edit", Icon: EditIcon },
							{ name: "Hand", Icon: HandIcon },
						].map(({ name, Icon }) => (
							<button
								type="button"
								aria-label={name}
								aria-pressed={tool === name}
								key={name}
								onClick={() => setTool(name)}
							>
								<Icon className="appearance-tool-icon" />
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function Compact({ state, advanced }: { state: Appearance; advanced: boolean }) {
	return (
		<div className="appearance-compact">
			<Row label="Theme">
				<ThemePicker state={state} />
			</Row>
			<Row label="Colour mode">
				<ModePicker state={state} />
			</Row>
			<div className="appearance-divider" />
			<FontRows state={state} />
			<Accent state={state} />
			<Advanced state={state} initiallyOpen={advanced} />
			<div className="appearance-preview-label">
				<span>Preview</span>
				<Reset state={state} />
			</div>
			<Preview state={state} wide />
			<p className="appearance-note">Appearance changes spool’s interface. Your frames keep their own styles.</p>
		</div>
	);
}

function BesidePreview({ state, advanced }: { state: Appearance; advanced: boolean }) {
	return (
		<div className="appearance-split">
			<div className="appearance-split-fields">
				<Row label="Theme">
					<ThemePicker state={state} />
				</Row>
				<Row label="Colour mode">
					<ModePicker state={state} />
				</Row>
				<div className="appearance-divider" />
				<FontRows state={state} />
				<Accent state={state} />
				<Advanced state={state} initiallyOpen={advanced} />
				<Reset state={state} />
			</div>
			<div className="appearance-split-preview">
				<Preview state={state} />
				<p className="appearance-note">Try the controls. Changes apply throughout spool.</p>
				<p className="appearance-note">Your frames keep their own styles.</p>
			</div>
		</div>
	);
}

function Simple({ state, advanced }: { state: Appearance; advanced: boolean }) {
	const [open, setOpen] = useState(advanced);
	return (
		<div className="appearance-simple">
			<div className="appearance-simple-pickers">
				<div>
					<span>Theme</span>
					<ThemePicker state={state} />
				</div>
				<div>
					<span>Colour mode</span>
					<ModePicker state={state} />
				</div>
			</div>
			<Preview state={state} wide />
			<div className="appearance-summary">
				<span>
					{state.font} · {state.size}
					{state.changed ? " · Customized" : ""}
				</span>
				<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
					Customize <span>{open ? "⌃" : "⌄"}</span>
				</button>
			</div>
			{open ? (
				<div className="appearance-customize">
					<FontRows state={state} />
					<Accent state={state} />
					<Advanced state={state} initiallyOpen={advanced} />
					<Reset state={state} />
				</div>
			) : null}
			<p className="appearance-note">A theme sets colours, fonts, and interface size. Customize any part of it.</p>
		</div>
	);
}

export function AppearancePrototype({ layout, advanced = false }: { layout: Layout; advanced?: boolean }) {
	const state = useAppearance();
	const [visible, setVisible] = useState(true);
	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setVisible(false);
		};
		window.addEventListener("keydown", escape);
		return () => window.removeEventListener("keydown", escape);
	}, []);
	return (
		<div className="appearance-prototype" style={state.style}>
			<SpoolCanvasScreen variant="rest" />
			{visible ? (
				<>
					<div className="appearance-scrim" />
					<div className="appearance-modal-host">
						<div className="appearance-modal" data-layout={layout} role="dialog" aria-label="Settings">
							<header>
								<strong>Settings</strong>
								<button type="button" aria-label="Close settings" onClick={() => setVisible(false)}>
									×
								</button>
							</header>
							<div className="appearance-tabs">
								<span>General</span>
								<span aria-current="page">Appearance</span>
							</div>
							{layout === "compact" ? (
								<Compact state={state} advanced={advanced} />
							) : layout === "preview" ? (
								<BesidePreview state={state} advanced={advanced} />
							) : (
								<Simple state={state} advanced={advanced} />
							)}
						</div>
					</div>
				</>
			) : (
				<button type="button" className="appearance-reopen" onClick={() => setVisible(true)}>
					Open appearance
				</button>
			)}
		</div>
	);
}
