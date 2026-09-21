import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";

/** One empty-screen composition. Callers supply the icon, words, and actions. */
export function EmptyState({
	icon,
	title,
	description,
	actions,
	children,
	heading = "h2",
	align = "center",
	className,
}: {
	icon?: ReactNode;
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
	heading?: "h1" | "h2";
	align?: "center" | "start";
	className?: string;
}) {
	const Heading = heading;
	return (
		<div className={cn("spool-empty flex flex-col justify-center [&>svg]:mb-[36px] [&>svg]:h-[32px] [&>svg]:w-[32px] [&>svg]:text-muted", align === "start" ? "spool-empty-start items-start text-left" : "items-center text-center", className)}>
			{icon}
			<Heading className="[font:var(--type-page)] [&]:font-medium tracking-tight">{title}</Heading>
			{description && <p className="mt-[13px] [font:var(--type-control)] text-muted">{description}</p>}
			{actions && <div className="spool-empty-actions flex items-center justify-center flex-wrap gap-[12px] mt-[25px]">{actions}</div>}
			{children}
		</div>
	);
}

export function EmptyFramesIcon() {
	return (
		<div className="spool-empty-frames relative w-[87px] h-[70px] mb-[36px]" aria-hidden="true">
			<i className="absolute inset-0 grid place-items-center border border-border-raised rounded-[8px] bg-bg [transform:rotate(-10deg)_translate(-13px,-2px)]" />
			<i className="absolute inset-0 grid place-items-center border border-border-raised rounded-[8px] bg-bg [transform:rotate(10deg)_translate(13px,0)]" />
			<span className="absolute inset-0 grid place-items-center border border-border-raised rounded-[8px] bg-bg text-muted [font:var(--type-page)]">+</span>
		</div>
	);
}
