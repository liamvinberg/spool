import type { PlaceTab } from "shared/lib/explore/tab-place/tabs";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import type { Artwork } from "shared/ui/demo/home-data";
import { DotsIcon } from "shared/ui/spool/icons";
import { type IconTake, TabIcon } from "./project-icon";

/**
 * Home's covers (`src/ui/home.tsx`, the caption's classes copied) with the project's icon ahead of its name,
 * drawn the way the tab draws it, and the cover's menu holding the same "Change icon…".
 */
export function IconHome({
	take,
	covers,
	menu,
	frame,
	argues,
}: {
	take: IconTake;
	covers: readonly { tab: PlaceTab; art: Artwork; frames: number; opened: string }[];
	/** the cover whose menu is open */
	menu?: string | undefined;
	frame: string;
	argues: string;
}) {
	return (
		<div className="flex h-full flex-col gap-3 bg-bg p-4 pb-3 font-sans text-text antialiased [font-synthesis:none]">
			<div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border-raised bg-bg px-[56px] pt-[40px]">
				<div className="mb-[24px] flex items-baseline gap-[10px]">
					<span className="font-[500] type-title">Projects</span>
					<span className="text-muted type-detail">{covers.length}</span>
				</div>
				<div className="grid grid-cols-3 gap-x-[24px]">
					{covers.map(({ tab, art, frames, opened }) => (
						<article key={tab.root} className="relative min-w-0">
							<div className="relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
								<ProjectArtwork kind={art} className="h-full w-full" />
							</div>
							<div className="flex items-center justify-between gap-[9px] pt-[15px] pr-[32px]">
								<span className="flex min-w-0 items-center gap-[10px]">
									<TabIcon tab={tab} take={take} size={20} />
									<strong className="truncate font-[500] type-title">{tab.name}</strong>
								</span>
								<span className="shrink-0 text-muted type-detail">{frames} frames</span>
							</div>
							<span className="mt-[7px] block pl-[30px] text-muted type-detail">{opened}</span>
							{menu === tab.root ? (
								<span className="absolute right-[-4px] bottom-[-2px] flex h-[28px] w-[28px] items-center justify-center rounded-[5px] bg-surface text-text">
									<DotsIcon className="h-3.5 w-3.5" />
								</span>
							) : null}
							{menu === tab.root ? (
								<div className="absolute top-full right-0 z-20 mt-[6px] flex w-[196px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit">
									{["Open", "Change icon…", ...(tab.place.kind === "team" ? [] : ["Move to team…"]), "Copy path"].map((label) => (
										<span key={label} className={cn("flex h-[30px] items-center rounded-sm px-3 text-text type-control", label === "Change icon…" && "bg-surface")}>
											{label}
										</span>
									))}
									<div className="mx-2 my-unit h-px bg-border-raised" />
									<span className="flex h-[30px] items-center rounded-sm px-3 text-text type-control">Remove from spool</span>
								</div>
							) : null}
						</article>
					))}
				</div>
			</div>
			<div className="flex shrink-0 items-baseline gap-3 px-1">
				<span className="shrink-0 font-mono text-2xs text-muted/60">{frame}</span>
				<p className="min-w-0 text-base text-muted leading-base">{argues}</p>
			</div>
		</div>
	);
}
