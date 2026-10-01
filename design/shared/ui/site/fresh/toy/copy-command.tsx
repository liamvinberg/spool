import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";

export const DOWNLOAD = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";
export const INSTALL = "npm i -g spool.page";
export const REPO = "https://github.com/liamvinberg/spool";
export const AUTHOR = "https://x.com/liamvinberg";

/** A command you can press to copy. Falls back to selecting the text. */
export function CopyCommand({ command, className }: { command: string; className?: string }) {
	const [status, setStatus] = useState<"idle" | "copied" | "select">("idle");
	const code = useRef<HTMLElement>(null);
	const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (reset.current !== null) clearTimeout(reset.current);
		},
		[],
	);
	const copy = async () => {
		if (reset.current !== null) clearTimeout(reset.current);
		try {
			await navigator.clipboard.writeText(command);
			setStatus("copied");
		} catch {
			const selection = window.getSelection();
			if (code.current && selection) {
				const range = document.createRange();
				range.selectNodeContents(code.current);
				selection.removeAllRanges();
				selection.addRange(range);
			}
			setStatus("select");
		}
		reset.current = setTimeout(() => setStatus("idle"), 2200);
	};
	return (
		<button
			type="button"
			className={cn("toy-command", className)}
			data-status={status}
			aria-label={`Copy ${command}`}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={() => void copy()}
		>
			<code ref={code}>{command}</code>
			<span aria-live="polite">{status === "copied" ? "copied" : status === "select" ? "⌘C" : "copy"}</span>
		</button>
	);
}
