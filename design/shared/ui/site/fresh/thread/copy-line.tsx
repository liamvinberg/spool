import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";

export const DOWNLOAD = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";
export const REPO = "https://github.com/liamvinberg/spool";
export const INSTALL = "npm i -g spool.page";

/** A shell line you can copy: the prompt names where it runs, the command is the payload. */
export function CopyLine({ command, prompt = "~", className }: { command: string; prompt?: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(command);
			setCopied(true);
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard refused: the command stays selectable as text.
		}
	};
	return (
		<button
			type="button"
			className={cn("th-line", className)}
			aria-label={`Copy command: ${command}`}
			onClick={() => void copy()}
		>
			<span className="th-line-prompt">{prompt} $</span>
			<code>{command}</code>
			<span className="th-line-state" aria-live="polite">
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}
