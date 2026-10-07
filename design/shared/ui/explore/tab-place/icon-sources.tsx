import type { PlaceTab } from "shared/lib/explore/tab-place/tabs";
import { type IconTake, TabIcon } from "./project-icon";

/**
 * Where a tab's icon comes from, first found wins: the file in design/, the repo's favicon, the name's letter.
 * One row per source, the icon at Home's size and at the tab's, beside the path spool read it from.
 */
export function IconSources({
	take,
	rows,
	frame,
	argues,
}: {
	take: IconTake;
	rows: readonly { tab: PlaceTab; from: string; says: string }[];
	frame: string;
	argues: string;
}) {
	return (
		<div className="flex h-full flex-col gap-3 bg-bg p-4 pb-3 font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex min-h-0 flex-1 flex-col justify-center gap-[6px] overflow-hidden rounded-xl border border-border-raised bg-canvas px-[40px]">
				{rows.map(({ tab, from, says }, index) => (
					<div key={tab.root} className="flex items-center gap-[28px] border-border border-b py-[18px] last:border-b-0">
						<span className="w-[18px] shrink-0 font-mono text-muted text-xs">{index + 1}</span>
						<span className="grid w-[56px] shrink-0 place-items-center">
							<TabIcon tab={tab} take={take} size={40} cut="var(--color-canvas)" />
						</span>
						<span className="flex h-[36px] w-[210px] shrink-0 items-center gap-[10px] rounded-t-[8px] border border-border border-b-0 bg-bg pl-[10px] text-text [font:var(--type-control)]">
							<TabIcon tab={tab} take={take} />
							<span className="truncate">{tab.name}</span>
						</span>
						<span className="w-[220px] shrink-0 font-mono text-[12px] text-muted">{from}</span>
						<p className="min-w-0 text-base text-text leading-base">{says}</p>
					</div>
				))}
			</div>
			<div className="flex shrink-0 items-baseline gap-3 px-1">
				<span className="shrink-0 font-mono text-2xs text-muted/60">{frame}</span>
				<p className="min-w-0 text-base text-muted leading-base">{argues}</p>
			</div>
		</div>
	);
}
