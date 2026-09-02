import { cn } from "shared/lib/utils";
import { CheckIcon } from "shared/ui/spool/icons";

export type CoffeeScreenName = "menu" | "cart" | "receipt";
export type CoffeeScreenScale = "canvas" | "design" | "full";

interface CoffeeScreenProps {
	actionLabel?: string;
	className?: string;
	goTo?: string;
	scale?: CoffeeScreenScale;
	screen: CoffeeScreenName;
	viewTransitionName?: string;
}

const products = [
	{ name: "Cortado", price: "$4.20" },
	{ name: "Flat white", price: "$4.80" },
	{ name: "Filter coffee", price: "$3.20" },
] as const;

const cart = products.slice(0, 2);

export function CoffeeScreen({
	actionLabel,
	className,
	goTo,
	scale = "canvas",
	screen,
	viewTransitionName,
}: CoffeeScreenProps) {
	if (screen === "menu") {
		return (
			<CoffeeMenu
				actionLabel={actionLabel}
				className={className}
				goTo={goTo}
				scale={scale}
				viewTransitionName={viewTransitionName}
			/>
		);
	}
	if (screen === "cart") {
		return (
			<CoffeeCart
				actionLabel={actionLabel}
				className={className}
				goTo={goTo}
				scale={scale}
				viewTransitionName={viewTransitionName}
			/>
		);
	}
	return <CoffeeReceipt className={className} scale={scale} viewTransitionName={viewTransitionName} />;
}

function CoffeeMenu({
	actionLabel = "Checkout",
	className,
	goTo,
	scale,
	viewTransitionName,
}: Omit<CoffeeScreenProps, "screen">) {
	const full = scale === "full";
	const design = scale === "design";
	return (
		<div
			className={cn(
				"flex h-full w-full flex-col overflow-hidden border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]",
				full ? "rounded-lg px-6 pb-6 pt-8" : design ? "rounded-lg p-3.5" : "rounded-lg px-4 pb-4 pt-[18px]",
				className,
			)}
			style={viewTransitionName === undefined ? undefined : { viewTransitionName }}
		>
			<div className={cn("flex flex-col", full ? "gap-[18px]" : design ? "gap-3.5" : "gap-3")}>
				<div className="flex flex-col gap-0.5">
					<h1
						className={cn(
							"font-semibold tracking-tight",
							full ? "text-[22px] leading-7" : design ? "text-[15px] leading-[18px]" : "text-[16px] leading-5",
						)}
					>
						kaffe
					</h1>
					<p
						className={cn(
							"text-[#86868B]",
							full ? "text-[13px] leading-[18px]" : design ? "text-xs leading-[14px]" : "text-[9px] leading-3",
						)}
					>
						Torsgatan 11
					</p>
				</div>
				<div className="flex flex-col gap-2">
					{products.map((product) => (
						<div
							key={product.name}
							className={cn(
								"flex items-center rounded-md bg-[#EFEFF1]",
								full ? "gap-3 px-4 py-[13px]" : design ? "gap-2.5 px-2.5 py-2" : "gap-2 p-1.5",
							)}
						>
							<span
								className={cn("shrink-0 rounded-full bg-[#D9D9DE]", full ? "h-9 w-9" : "h-[22px] w-[22px]")}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 font-medium",
									full ? "text-[15px] leading-5" : design ? "text-sm leading-[15px]" : "text-2xs leading-3",
								)}
							>
								{product.name}
							</span>
							<span
								className={cn(
									"shrink-0 text-[#86868B]",
									full ? "text-[15px] leading-5" : design ? "text-xs leading-[14px]" : "text-[9px] leading-3",
								)}
							>
								{product.price}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="min-h-3 flex-1" />
			<CoffeeAction
				goTo={goTo}
				className={cn(
					"flex shrink-0 items-center justify-center rounded-md bg-[#17171A] font-medium text-[#FEFEFE]",
					full
						? "h-12 text-[16px] leading-5"
						: design
							? "h-[38px] text-sm leading-none"
							: "h-[30px] text-2xs leading-3",
				)}
			>
				{actionLabel}
			</CoffeeAction>
		</div>
	);
}

function CoffeeCart({
	actionLabel = "Pay",
	className,
	goTo,
	scale,
	viewTransitionName,
}: Omit<CoffeeScreenProps, "screen">) {
	const full = scale === "full";
	const design = scale === "design";
	return (
		<div
			className={cn(
				"flex h-full w-full flex-col overflow-hidden border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]",
				full ? "rounded-lg px-6 pb-6 pt-8" : design ? "rounded-lg p-3.5" : "rounded-lg px-4 pb-4 pt-[18px]",
				className,
			)}
			style={viewTransitionName === undefined ? undefined : { viewTransitionName }}
		>
			<div className={cn("flex flex-col", full ? "gap-[18px]" : design ? "gap-3.5" : "gap-3")}>
				<h1
					className={cn(
						"font-semibold tracking-tight",
						full ? "text-[22px] leading-7" : design ? "text-[15px] leading-[18px]" : "text-md leading-sm",
					)}
				>
					Your cart
				</h1>
				<div className="flex flex-col gap-2">
					{cart.map((product) => (
						<div
							key={product.name}
							className={cn(
								"flex items-center justify-between rounded-md bg-[#EFEFF1]",
								full ? "px-4 py-[15px]" : design ? "px-3 py-[9px]" : "px-1.5 py-2",
							)}
						>
							<span
								className={cn(
									"font-medium",
									full ? "text-[15px] leading-5" : design ? "text-sm leading-[15px]" : "text-2xs leading-3",
								)}
							>
								1 × {product.name}
							</span>
							<span
								className={cn(
									"text-[#86868B]",
									full ? "text-[15px] leading-5" : design ? "text-xs leading-[14px]" : "text-[9px] leading-3",
								)}
							>
								{product.price}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="min-h-3 flex-1" />
			<div className={cn("flex flex-col", full ? "gap-[18px]" : design ? "gap-3" : "gap-0")}>
				<div className={cn("flex items-baseline justify-between", full ? "px-0.5" : design ? "" : "px-0.5 py-2")}>
					<span
						className={cn(
							full
								? "font-medium text-[17px] leading-md"
								: design
									? "font-medium text-sm leading-[15px]"
									: "text-2xs leading-3 text-[#86868B]",
						)}
					>
						Total
					</span>
					<span
						className={cn(
							"font-semibold",
							full ? "text-[17px] leading-md" : design ? "text-base leading-4" : "text-xs leading-[14px]",
						)}
					>
						$9.00
					</span>
				</div>
				<CoffeeAction
					goTo={goTo}
					className={cn(
						"flex shrink-0 items-center justify-center rounded-md bg-[#17171A] font-semibold text-[#FEFEFE]",
						full
							? "h-12 text-[16px] leading-5"
							: design
								? "h-[38px] text-sm leading-none"
								: "h-[30px] text-2xs leading-3",
					)}
				>
					{actionLabel}
				</CoffeeAction>
			</div>
		</div>
	);
}

function CoffeeReceipt({
	className,
	scale,
	viewTransitionName,
}: Omit<CoffeeScreenProps, "screen" | "goTo">) {
	const full = scale === "full";
	const design = scale === "design";
	return (
		<div
			className={cn(
				"flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]",
				full ? "gap-3 px-6" : design ? "gap-3 p-3.5" : "gap-2 px-3.5",
				className,
			)}
			style={viewTransitionName === undefined ? undefined : { viewTransitionName }}
		>
			<div
				className={cn(
					"flex items-center justify-center rounded-full bg-[#17171A] text-[#FEFEFE]",
					full ? "h-14 w-14" : design ? "h-11 w-11" : "h-10 w-10",
				)}
			>
				<CheckIcon className={cn(full ? "h-6 w-6" : design ? "h-5 w-5" : "h-[18px] w-[18px]")} />
			</div>
			<h1 className={cn("font-semibold tracking-tight", full ? "text-[22px] leading-7" : "text-[16px] leading-5")}>
				Thanks!
			</h1>
			<div className={cn("flex flex-col items-center", design || full ? "gap-unit" : "gap-2")}>
				<p
					className={cn(
						"text-[#86868B]",
						full
							? "font-medium text-[14px] leading-5"
							: design
								? "font-medium text-xs leading-[14px]"
								: "text-2xs leading-3",
					)}
				>
					Order #214
				</p>
				<p
					className={cn(
						"text-[#86868B]",
						full ? "text-[13px] leading-[18px]" : design ? "text-2xs leading-3" : "text-[9px] leading-3",
					)}
				>
					Your receipt is on its way by email
				</p>
			</div>
		</div>
	);
}

function CoffeeAction({ children, className, goTo }: { children: React.ReactNode; className: string; goTo?: string }) {
	if (goTo === undefined) return <div className={className}>{children}</div>;
	return (
		<button type="button" data-go={goTo} className={className}>
			{children}
		</button>
	);
}
