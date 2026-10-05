import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";

export function Button({ children, tone = "solid" }: { children: ReactNode; tone?: "solid" | "quiet" }) {
	return (
		<button
			type="button"
			className={cn(
				"rounded-card px-4 py-2 font-display text-sm transition-colors",
				tone === "solid" ? "bg-accent text-paper hover:bg-ink" : "bg-transparent text-ink hover:underline",
			)}
		>
			{children}
		</button>
	);
}
