import { cn } from "shared/lib/utils";
import { SettingsPanel, type SettingsSeed, useSettings } from "shared/ui/explore/settings/panel";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * Take two: a section of Home.
 *
 * Home is the one screen that is about the install rather than a project, so
 * settings belong to it the way the project list does. It grows a rail with two
 * rows, and the install's own line sits at the foot of it.
 *
 * The cost is the project band. There is no canvas behind Home and no focused
 * project, so history has to name the project it is about: the band's heading
 * carries a picker over the registered roots. That is the choice this take
 * makes, and it is the thing to argue with.
 */
export function SettingsHomeScreen({ seed, argues }: { seed?: SettingsSeed | undefined; argues: string }) {
	const settings = useSettings(seed);
	return (
		<SpoolShell canvasControls={false} tabs={["spool", "notaker"]}>
			<div className="relative flex h-full w-full overflow-hidden bg-bg" style={settings.style}>
				<nav className="flex w-[248px] shrink-0 flex-col border-border border-r px-3 py-4" aria-label="Home">
					<HomeRow name="Projects" />
					<HomeRow name="Settings" active />
					<span className="mt-auto flex flex-col gap-1 px-3 pb-1">
						<span className="font-mono text-2xs text-muted leading-3">spool 0.15.0</span>
						<span className="font-mono text-2xs text-muted/50 leading-3">~/.spool</span>
					</span>
				</nav>

				<div className="min-h-0 flex-1 overflow-hidden">
					<div className="flex h-full w-full max-w-[840px] flex-col pt-12 pr-4 pb-10 pl-14">
						<div className="flex shrink-0 flex-col gap-2 px-7 pb-6">
							<h1 className="font-semibold text-lg text-text tracking-tight leading-lg">Settings</h1>
							<p className="max-w-[52ch] text-base text-muted leading-base">
								What you are allowed to change, and the file each change lands in.
							</p>
						</div>
						{/* the page holds still and the panel scrolls, so the tabs are where you left them */}
						<div className="flex min-h-0 flex-1 flex-col">
							<SettingsPanel settings={settings} scope="pick" />
						</div>
					</div>
				</div>

				<p className="pointer-events-none absolute right-7 bottom-6 max-w-[34ch] text-right text-base text-muted leading-base">
					{argues}
				</p>
			</div>
		</SpoolShell>
	);
}

function HomeRow({ name, active = false }: { name: string; active?: boolean }) {
	return (
		<button
			type="button"
			className={cn(
				"relative flex h-8 items-center rounded-sm px-3 text-left text-base leading-base transition-colors duration-150",
				active ? "bg-surface text-text" : "text-muted hover:text-text",
			)}
		>
			{active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			{name}
		</button>
	);
}
