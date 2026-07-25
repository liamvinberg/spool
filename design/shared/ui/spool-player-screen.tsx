import { CoffeeScreen } from "./coffee-screens";
import { BackIcon, CloseIcon, MotionIcon, RestartIcon } from "./spool-icons";

interface SpoolPlayerScreenProps {
	backTarget?: string;
	closeTarget?: string;
	receiptTarget?: string;
}

export function SpoolPlayerScreen({ backTarget, closeTarget, receiptTarget }: SpoolPlayerScreenProps) {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="absolute left-[525px] top-7 h-[780px] w-[390px]">
				<CoffeeScreen
					screen="cart"
					scale="full"
					goTo={receiptTarget}
					viewTransitionName="coffee-screen"
				/>
			</div>
			<div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-[3px] rounded-md border border-border-raised bg-raised px-2 py-1.5">
				<button
					type="button"
					data-go={backTarget}
					className="flex h-7 w-7 items-center justify-center text-muted"
					aria-label="Back"
				>
					<BackIcon className="h-4 w-4" />
				</button>
				<div className="flex items-center gap-[5px] px-[3px] font-mono text-sm leading-sm">
					<span className="text-muted">menu</span>
					<span className="text-muted">/</span>
					<span>cart</span>
				</div>
				<div className="h-[18px] w-px bg-border-raised" />
				<button type="button" className="flex h-7 w-7 items-center justify-center text-muted" aria-label="Restart">
					<RestartIcon className="h-4 w-4" />
				</button>
				<button
					type="button"
					className="flex h-[22px] w-[30px] items-center justify-center rounded-sm bg-surface"
					aria-label="Motion on"
				>
					<MotionIcon className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					data-go={closeTarget}
					className="flex h-7 w-7 items-center justify-center text-muted"
					aria-label="Close"
				>
					<CloseIcon className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
