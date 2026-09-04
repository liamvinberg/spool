import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { SettingsPanel, type SettingsSeed, TabRow, useSettings } from "shared/ui/explore/settings/panel";
import { SpoolCanvasScreen } from "shared/ui/spool/canvas-screen";

/**
 * Take three: a window of its own in the Mac app.
 *
 * This is where a Mac app puts settings, so it costs a menu item and a keystroke
 * and nothing else: `desktop/` already owns a menu, and ⌘, is the one shortcut
 * every Mac user already has. The window is the OS's, the tabs and everything
 * under them are spool's.
 *
 * It is also the take that only exists in one place. A browser tab has no app
 * menu, so this take has to be paired with one of the other two rather than
 * replace it, and that is the argument against it.
 *
 * The desk is drawn small on purpose: the canvas window behind is the real
 * chrome at close to real size, so the settings window can be judged against
 * the app it belongs to rather than against a blank screen.
 */

// `--color-*: initial` in tokens.css clears Tailwind's palette, `white` and
// `black` included, so a `text-white/70` here compiles to nothing and the words
// come out black on a black desk. The OS greys are written as literals.
const MENU_H = 26;
const CANVAS_RECT = { x: 40, y: 52, w: 1060, h: 800 };
const SETTINGS_RECT = { x: 524, y: 160, w: 760, h: 604 };

export function SettingsWindowScreen({ seed, argues }: { seed?: SettingsSeed | undefined; argues: string }) {
	const settings = useSettings(seed);
	return (
		<div
			className="relative h-full w-full overflow-hidden font-sans antialiased [font-synthesis:none]"
			style={{
				...settings.style,
				background: "radial-gradient(120% 90% at 22% 8%, #241d1a 0%, #16151a 42%, #0b0b0d 100%)",
			}}
		>
			<MacWindow rect={CANVAS_RECT} title="kaffe" active={false}>
				<SpoolCanvasScreen variant="rest" />
			</MacWindow>

			<AppMenu />

			<MacWindow rect={SETTINGS_RECT} title="Settings" active>
				<div className="flex h-full min-h-0 flex-col bg-bg" style={settings.style}>
					<TabRow tab={settings.tab} onTab={settings.setTab} />
					<SettingsPanel settings={settings} scope="pick" tabs={false} />
				</div>
			</MacWindow>

			<MenuBar />

			<p className="pointer-events-none absolute right-7 bottom-6 z-40 max-w-[38ch] text-right text-base text-[rgba(255,255,255,0.7)] leading-base">
				{argues}
			</p>
		</div>
	);
}

function MenuBar() {
	return (
		<div
			className="absolute inset-x-0 top-0 z-50 flex items-center gap-4 bg-[rgba(0,0,0,0.45)] px-4 text-[#E6E6E8] backdrop-blur-md"
			style={{ height: MENU_H }}
		>
			<Apple />
			<span className="rounded-[3px] bg-[rgba(255,255,255,0.18)] px-1.5 py-0.5 font-semibold text-xs leading-none">
				spool
			</span>
			{["File", "Edit", "View", "Window", "Help"].map((item) => (
				<span key={item} className="text-xs leading-none opacity-80">
					{item}
				</span>
			))}
			<span className="ml-auto flex items-center gap-3.5 text-xs leading-none opacity-80">
				<span>100%</span>
				<span>Mon 09:41</span>
			</span>
		</div>
	);
}

/** The menu the window came out of, left open so the reach is on the frame. */
function AppMenu() {
	return (
		<div
			className="absolute z-40 flex w-[236px] flex-col rounded-b-[6px] border border-[rgba(255,255,255,0.1)] bg-[#2A2A2E]/95 p-1.5 text-[#E6E6E8] backdrop-blur-md"
			style={{ top: MENU_H, left: 34 }}
		>
			<MenuItem name="About spool" />
			<MenuRule />
			<MenuItem name="Settings…" keys="⌘," lit />
			<MenuItem name="Check for updates" />
			<MenuRule />
			<MenuItem name="Hide spool" keys="⌘H" />
			<MenuItem name="Quit spool" keys="⌘Q" />
		</div>
	);
}

function MenuItem({ name, keys, lit = false }: { name: string; keys?: string; lit?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-[22px] items-center justify-between rounded-[4px] px-2 text-xs leading-none",
				lit ? "bg-[#3C6DF0] text-[#ffffff]" : "",
			)}
		>
			{name}
			<span
				className={cn(
					"text-xs leading-none",
					lit ? "text-[rgba(255,255,255,0.8)]" : "text-[rgba(255,255,255,0.4)]",
				)}
			>
				{keys}
			</span>
		</span>
	);
}

function MenuRule() {
	return <span className="my-1 h-px bg-[rgba(255,255,255,0.12)]" />;
}

function MacWindow({
	rect,
	title,
	active,
	children,
}: {
	rect: { x: number; y: number; w: number; h: number };
	title: string;
	active: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"absolute flex flex-col overflow-hidden rounded-[10px] border",
				active ? "z-30 border-[rgba(255,255,255,0.12)]" : "z-10 border-[rgba(255,255,255,0.06)]",
			)}
			style={{
				left: rect.x,
				top: rect.y,
				width: rect.w,
				height: rect.h,
				boxShadow: active
					? "0 34px 70px rgba(0,0,0,.62), 0 4px 14px rgba(0,0,0,.45)"
					: "0 16px 34px rgba(0,0,0,.45)",
			}}
		>
			<div className="relative flex h-[38px] shrink-0 items-center border-[#2A2A2E] border-b bg-[#232326] px-4">
				<Lights active={active} />
				<span
					className={cn(
						"-translate-x-1/2 absolute left-1/2 font-medium text-xs leading-none",
						active ? "text-[#D6D6DA]" : "text-[#75757A]",
					)}
				>
					{title}
				</span>
			</div>
			<div className="relative min-h-0 flex-1">{children}</div>
		</div>
	);
}

const LIGHTS = [
	{ role: "close", lit: "#FF5F57" },
	{ role: "minimise", lit: "#FEBC2E" },
	{ role: "zoom", lit: "#28C840" },
] as const;

function Lights({ active }: { active: boolean }) {
	return (
		<span className="flex items-center gap-2">
			{LIGHTS.map((light) => (
				<span
					key={light.role}
					className="h-3 w-3 rounded-full"
					style={{ background: active ? light.lit : "#4A4A4E" }}
				/>
			))}
		</span>
	);
}

function Apple() {
	return (
		<svg viewBox="0 0 14 16" className="h-3.5 w-3" fill="currentColor" aria-hidden="true">
			<path d="M11.2 8.5c0-1.7 1.4-2.5 1.4-2.6-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6c-1.1 0-2.2.7-2.7 1.7-1.2 2-.3 5 .8 6.6.6.8 1.2 1.7 2.1 1.7.9 0 1.2-.6 2.2-.6s1.3.6 2.2.5c.9 0 1.5-.8 2-1.6.7-1 .9-1.9.9-2-.1 0-1.8-.7-1.8-2.4ZM9.6 3.2c.5-.6.8-1.4.7-2.2-.7 0-1.6.4-2.1 1-.4.5-.8 1.4-.7 2.2.8.1 1.6-.4 2.1-1Z" />
		</svg>
	);
}
