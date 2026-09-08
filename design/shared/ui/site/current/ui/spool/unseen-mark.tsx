import { cn } from "../../lib/utils";

export type Mark = "new" | "changed";

export function UnseenMark({ mark, className }: { mark: Mark; className?: string | undefined }) {
	return (
		<span aria-hidden="true" className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			<span
				className={cn(
					"block animate-unseen-in rounded-full",
					mark === "new" ? "h-[5px] w-[5px] bg-text/85" : "h-[7px] w-[7px] border-[1.5px] border-text/70",
				)}
			/>
		</span>
	);
}
