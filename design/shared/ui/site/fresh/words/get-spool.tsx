import { useEffect, useRef, useState } from "react";

/* What both typographic takes point at: the download, the command, the people. */
export const DOWNLOAD = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";
export const REPO = "https://github.com/liamvinberg/spool";
export const AUTHOR = "https://x.com/liamvinberg";
export const INSTALL = "npm i -g spool.page";

/* A command you can take with one press. The words stay selectable, the status
 * speaks in the machine's register, and a failed clipboard selects the text so a
 * second keystroke still gets it. */
export function CopyCommand({
	command,
	className,
	prompt,
}: {
	command: string;
	className?: string;
	prompt?: string;
}) {
	const [copied, setCopied] = useState(false);
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
		} catch {
			const selection = window.getSelection();
			if (code.current && selection) {
				const range = document.createRange();
				range.selectNodeContents(code.current);
				selection.removeAllRanges();
				selection.addRange(range);
			}
		}
		setCopied(true);
		reset.current = setTimeout(() => setCopied(false), 2200);
	};
	return (
		<button
			type="button"
			className={className}
			data-copied={copied}
			aria-label={`Copy ${command}`}
			onClick={() => void copy()}
		>
			{prompt ? <span data-part="prompt">{prompt}</span> : null}
			<code ref={code}>{command}</code>
			<span data-part="status" aria-live="polite">
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}
