import { SpoolMark } from "shared/ui/spool/mark";
import { Host } from "./parts";

/**
 * spool.page/tidemark/tidemark-app: a team project's link knocks on spool on
 * this Mac, the way local.spool.page already does, and hands over. Looking in
 * the browser is the fallback, for whoever has no spool or is on a phone.
 */
export function LinkOpensSpool() {
	return (
		<Host host="web" url="spool.page/tidemark/tidemark-app">
			<div className="flex h-full flex-col items-center justify-center pb-[60px]">
				<span className="relative grid h-[72px] w-[72px] place-items-center">
					<span className="absolute inset-0 animate-ping rounded-full border border-thread opacity-30 [animation-duration:2.4s]" />
					<SpoolMark className="h-[36px] w-[27px] text-thread" />
				</span>
				<h1 className="mt-[34px] type-heading">Opening tidemark app in spool</h1>
				<p className="mt-[10px] text-muted type-control">Jonas and Mira are in it now.</p>
				<div className="mt-[44px] flex items-center gap-[18px] text-muted type-control">
					<button type="button" className="hover:text-text">
						Look in the browser instead
					</button>
					<span className="h-[14px] w-px bg-border-raised" />
					<button type="button" className="hover:text-text">
						Get spool
					</button>
				</div>
				<p className="absolute bottom-[28px] text-muted type-detail">ada@tidemark.app · tidemark</p>
			</div>
		</Host>
	);
}
