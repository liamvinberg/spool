import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import "./empty-state.css";

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
		<div className={cn("spool-empty", align === "start" && "spool-empty-start", className)}>
			{icon}
			<Heading>{title}</Heading>
			{description && <p>{description}</p>}
			{actions && <div className="spool-empty-actions">{actions}</div>}
			{children}
		</div>
	);
}

export function EmptyFramesIcon() {
	return (
		<div className="spool-empty-frames" aria-hidden="true">
			<i />
			<i />
			<span>+</span>
		</div>
	);
}
