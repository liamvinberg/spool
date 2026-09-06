import type { ReactNode } from "react";
import { cn } from "../cn";

export function AccountButton({
	children,
	onClick,
	primary = false,
	disabled = false,
}: {
	children: ReactNode;
	onClick: () => void;
	primary?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex h-8 items-center justify-center rounded-sm px-3 text-base leading-none disabled:opacity-50",
				primary ? "bg-thread px-4 font-medium text-on-thread" : "text-muted hover:text-text",
			)}
		>
			{children}
		</button>
	);
}
