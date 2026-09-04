import { createContext, type ReactNode, useContext } from "react";
import { cn } from "shared/lib/utils";

/** Throwaway shared primitives. Every example and demo frame renders these functions. */
export interface PrototypeTheme {
	radius: number;
	accent: string;
	held: "Button" | "Dialog" | "Badge" | null;
	pick: (part: "Button" | "Dialog" | "Badge") => void;
}

export const PrototypeThemeContext = createContext<PrototypeTheme>({
	radius: 8,
	accent: "#356653",
	held: null,
	pick: () => {},
});

export function Button({
	children,
	variant = "solid",
	disabled = false,
	onClick,
}: {
	children: ReactNode;
	variant?: "solid" | "outline";
	disabled?: boolean;
	onClick?: () => void;
}) {
	const theme = useContext(PrototypeThemeContext);
	return (
		<div
			className={cn(
				"prototype-part relative inline-flex",
				theme.held === "Button" && "outline outline-1 outline-offset-4 outline-thread",
			)}
		>
			<span className="prototype-hover pointer-events-none absolute -top-6 left-0 font-mono text-[10px] text-thread">
				Button
			</span>
			<button
				type="button"
				disabled={disabled}
				onClick={() => {
					theme.pick("Button");
					onClick?.();
				}}
				className="inline-flex min-h-10 items-center justify-center border px-4 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-35"
				style={{
					borderRadius: theme.radius,
					background: variant === "solid" ? theme.accent : "transparent",
					color: variant === "solid" ? "white" : theme.accent,
					borderColor: theme.accent,
				}}
			>
				{children}
			</button>
		</div>
	);
}

export function Badge({ children }: { children: ReactNode }) {
	const theme = useContext(PrototypeThemeContext);
	return (
		<button
			type="button"
			onClick={() => theme.pick("Badge")}
			className={cn(
				"rounded-full border px-2.5 py-1 text-[11px]",
				theme.held === "Badge" && "outline outline-1 outline-offset-4 outline-thread",
			)}
			style={{ color: theme.accent, borderColor: theme.accent }}
		>
			{children}
		</button>
	);
}

export function Dialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const theme = useContext(PrototypeThemeContext);
	if (!open) return null;
	return (
		<div
			className={cn(
				"w-[280px] rounded-xl border border-[#d9d6cc] bg-[#f7f5ef] p-5 text-[#24312b]",
				theme.held === "Dialog" && "outline outline-1 outline-offset-4 outline-thread",
			)}
		>
			<h3 className="text-xl font-medium">Change your departure?</h3>
			<p className="mt-2 mb-5 text-[13px] leading-5 text-[#69746b]">Your ticket stays valid for the next boat.</p>
			<Button onClick={onClose}>Keep this departure</Button>
		</div>
	);
}
