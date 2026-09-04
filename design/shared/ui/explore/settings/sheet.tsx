import { SettingsPanel, type SettingsSeed, useSettings } from "shared/ui/explore/settings/panel";
import { SpoolCanvasScreen } from "shared/ui/spool/canvas-screen";

/**
 * Take one: a sheet over the canvas, the smallest diff there is.
 *
 * `HotkeySheet` already works this way, so nothing new has to exist: the same
 * scrim, the same 760 panel, the same `esc closes`. The canvas it opens over is
 * the project the project band is about, which is why this take needs no picker.
 *
 * It also gets the theme preview for free. The changed colours are set on the
 * whole screen rather than on the panel, so an edited `thread` recolours the
 * threads on the field behind the sheet while the field is still open.
 */
export function SettingsSheetScreen({ seed, argues }: { seed?: SettingsSeed | undefined; argues: string }) {
	const settings = useSettings(seed);
	return (
		<div className="relative h-full w-full overflow-hidden" style={settings.style}>
			<SpoolCanvasScreen variant="rest" />

			<div className="absolute inset-0 z-30 animate-find-in bg-bg/48 backdrop-blur-[2px]" />
			<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-8">
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Settings"
					className="pointer-events-auto flex max-h-[calc(100%-128px)] w-[760px] animate-find-panel-in flex-col overflow-hidden rounded-lg border border-border-raised bg-surface"
				>
					<header className="flex h-12 shrink-0 items-center justify-between border-border border-b px-7">
						<span className="font-semibold text-md text-text tracking-tight leading-md">Settings</span>
						<span className="font-mono text-2xs text-muted leading-3">esc closes</span>
					</header>
					<SettingsPanel settings={settings} scope="current" />
				</div>
			</div>

			<p className="pointer-events-none absolute bottom-6 left-6 z-40 max-w-[42ch] text-base text-muted leading-base">
				{argues}
			</p>
		</div>
	);
}
