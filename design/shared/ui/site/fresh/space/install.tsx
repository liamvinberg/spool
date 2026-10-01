import { useEffect, useRef, useState } from "react";

export const DOWNLOAD = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";
export const REPO = "https://github.com/liamvinberg/spool";
export const INSTALL = "npm i -g spool.page";

/** The install line as a button that copies itself, falling back to selecting the text. */
export function CopyLine({ command, className }: { command: string; className?: string }) {
	const [status, setStatus] = useState("");
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
			setStatus("selected");
		}
		reset.current = setTimeout(() => setStatus(""), 2400);
	};
	return (
		<button className={className} type="button" aria-label={`Copy ${command}`} onClick={() => void copy()}>
			<code ref={code}>{command}</code>
			<span aria-live="polite">{status || "copy"}</span>
		</button>
	);
}
