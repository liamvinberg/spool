import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { SpoolCanvasScreen } from "shared/ui/spool/canvas-screen";
import { EditIcon, HandIcon, SelectIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import "./appearance.css";

// Prototype: compare three settings layouts, each in its own live frame.
// All changes stay in this frame. The chosen layout will be implemented separately.
type Mode = "Dark" | "Light" | "System";
type Layout = "compact" | "preview" | "simple";
type Palette = readonly [string, string, string, string, string, string, string];
const THEMES = {
	Spool: {
		font: "Familjen Grotesk",
		dark: ["#0e0e0e", "#161616", "#1c1c1c", "#282828", "#363636", "#f0efed", "#8e8c88"],
		light: ["#f0efec", "#e6e5e1", "#ffffff", "#ffffff", "#c2c0ba", "#1a1917", "#6f6c68"],
		accent: "#f5391a",
	},
	Figma: {
		font: "Inter",
		dark: ["#2c2c2c", "#1e1e1e", "#2c2c2c", "#383838", "#444444", "#ffffff", "#b3b3b3"],
		light: ["#ffffff", "#e5e5e5", "#ffffff", "#f5f5f5", "#e6e6e6", "#1e1e1e", "#767676"],
		accent: "#0d99ff",
	},
	Mono: {
		font: "Familjen Grotesk",
		dark: ["#000000", "#0a0a0a", "#111111", "#1f1f1f", "#333333", "#ffffff", "#888888"],
		light: ["#ffffff", "#f5f5f5", "#ffffff", "#eeeeee", "#cccccc", "#111111", "#737373"],
		accent: "#888888",
	},
	Nord: {
		font: "Familjen Grotesk",
		dark: ["#242933", "#2e3440", "#3b4252", "#434c5e", "#4c566a", "#eceff4", "#a3adc2"],
		light: ["#d8dee9", "#e5e9f0", "#eceff4", "#ffffff", "#b8c5d6", "#2e3440", "#4c566a"],
		accent: "#88c0d0",
	},
	"Tokyo Night": {
		font: "Familjen Grotesk",
		dark: ["#16161e", "#1a1b26", "#1f2335", "#292e42", "#414868", "#c0caf5", "#7982a9"],
		light: ["#d5d6db", "#e1e2e7", "#e9e9ed", "#ffffff", "#b4b5b9", "#343b58", "#6c6e75"],
		accent: "#7aa2f7",
	},
} satisfies Record<string, { font: string; dark: Palette; light: Palette; accent: string }>;
type ThemeName = keyof typeof THEMES;
const FONTS = ["Inter", "Familjen Grotesk", "System"];
const CODE_FONTS = ["Fragment Mono", "System mono"];
const FONT_STACKS: Record<string, string> = {
	Inter: '"Inter", system-ui, sans-serif',
	"Familjen Grotesk": '"Familjen Grotesk", system-ui, sans-serif',
	System: "system-ui, sans-serif",
	"Fragment Mono": '"Fragment Mono", ui-monospace, monospace',
	"System mono": "ui-monospace, SFMono-Regular, monospace",
};

function useAppearance() {
	const [theme, setTheme] = useState<ThemeName>("Figma");
	const [mode, setMode] = useState<Mode>("Dark");
	const [font, setFont] = useState("Inter");
	const [code, setCode] = useState("Fragment Mono");
	const [size, setSize] = useState("100%");
	const [accent, setAccent] = useState("#0d99ff");
	const [systemDark, setSystemDark] = useState(true);
	useEffect(() => {
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const update = () => setSystemDark(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	const dark = mode === "Dark" || (mode === "System" && systemDark);
	const colours = THEMES[theme][dark ? "dark" : "light"];
	const pick = (name: ThemeName) => {
		setTheme(name);
		setFont(THEMES[name].font);
		setCode("Fragment Mono");
		setSize("100%");
		setAccent(THEMES[name].accent);
	};
	const changed =
		font !== THEMES[theme].font || code !== "Fragment Mono" || size !== "100%" || accent !== THEMES[theme].accent;
	const style = {
		"--color-bg": colours[0],
		"--color-canvas": colours[1],
		"--color-surface": colours[2],
		"--color-raised": colours[3],
		"--color-border": colours[4],
		"--color-border-raised": colours[4],
		"--color-text": colours[5],
		"--color-muted": colours[6],
		"--color-thread": accent,
		"--color-on-thread": "#ffffff",
		"--font-sans": FONT_STACKS[font],
		"--font-mono": FONT_STACKS[code],
		"--appearance-scale": Number.parseInt(size, 10) / 100,
		colorScheme: dark ? "dark" : "light",
	} as CSSProperties;
	return { theme, mode, font, code, size, accent, changed, style, setMode, setFont, setCode, setSize, setAccent, pick };
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
		<Select
			label="Theme"
			value={state.theme}
			choices={Object.keys(THEMES)}
			onChange={(name) => state.pick(name as ThemeName)}
		/>
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
				<Select
					label="Interface size"
					value={state.size}
					choices={["90%", "100%", "110%", "125%"]}
					onChange={state.setSize}
				/>
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

function Preview({ state, wide = false }: { state: Appearance; wide?: boolean }) {
	const [selected, setSelected] = useState("cart");
	const [tool, setTool] = useState("Select");
	return (
		<div className="appearance-sample" data-wide={wide} aria-label="Interface preview" style={state.style}>
			<div className="appearance-sample-header">
				<SpoolMark className="appearance-mark" />
				<span>kaffe</span>
				<span className="appearance-sample-percent">72%</span>
			</div>
			<div className="appearance-sample-workspace">
				<div className="appearance-sample-sidebar">
					<strong>Pages</strong>
					<span>⌄ &nbsp; app</span>
					{["menu", "cart", "receipt"].map((name) => (
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

function Compact({ state }: { state: Appearance }) {
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
			<div className="appearance-preview-label">
				<span>Preview</span>
				<Reset state={state} />
			</div>
			<Preview state={state} wide />
			<p className="appearance-note">Appearance changes spool’s interface. Your frames keep their own styles.</p>
		</div>
	);
}

function BesidePreview({ state }: { state: Appearance }) {
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

function Simple({ state }: { state: Appearance }) {
	const [open, setOpen] = useState(false);
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
					<Reset state={state} />
				</div>
			) : null}
			<p className="appearance-note">A theme sets colours, fonts, and interface size. Customize any part of it.</p>
		</div>
	);
}

export function AppearancePrototype({ layout }: { layout: Layout }) {
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
								<Compact state={state} />
							) : layout === "preview" ? (
								<BesidePreview state={state} />
							) : (
								<Simple state={state} />
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
