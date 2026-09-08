import { useEffect, useRef, useState } from "react";
import { GuideIcon } from "./ui/site/sleeve-guide/icons";

export const INSTALL_COMMAND = "npm i -g spool.page";
export const DOWNLOAD = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";

export function CopyCommand({
	command,
	className,
	placement,
}: {
	command: string;
	className?: string;
	placement: string;
}) {
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
			setStatus("Copied");
			reset.current = setTimeout(() => setStatus(""), 2500);
		} catch {
			const selection = window.getSelection();
			if (code.current && selection) {
				const range = document.createRange();
				range.selectNodeContents(code.current);
				selection.removeAllRanges();
				selection.addRange(range);
			}
			setStatus("Select and copy");
		}
	};
	return (
		<button className={className} type="button" aria-label={`Copy command: ${command}`} onClick={() => void copy()}>
			<code ref={code}>{command}</code>
			<span aria-live="polite">{status || <GuideIcon name="copy" />}</span>
		</button>
	);
}
