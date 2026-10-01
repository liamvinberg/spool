import { type RefObject, useEffect, useRef, useState } from "react";
import { MARK_PATH } from "./mark-path";

export const DOWNLOAD = "https://github.com/liamvinberg/spool/releases/latest/download/Spool.dmg";
export const INSTALL_COMMAND = "npm i -g spool.page";
export const REPO = "https://github.com/liamvinberg/spool";
export const DOCS = `${REPO}#readme`;
export const LICENCE = `${REPO}/blob/main/LICENSE.md`;
export const X = "https://x.com/liamvinberg";

export function SpoolMark({ className }: { className?: string }) {
	return (
		<svg viewBox="250 182 524 660" className={className} fill="currentColor" fillRule="evenodd" aria-hidden="true">
			<path d={MARK_PATH} />
		</svg>
	);
}

type IconName = "copy" | "check" | "down" | "arrow";

export function Icon({ name, className }: { name: IconName; className?: string }) {
	const paths: Record<IconName, string> = {
		copy: "M9 9h11v11H9zM15 5V3H3v12h2",
		check: "m5 12.5 4.5 4.5L19 7.5",
		down: "M12 4v12m-5-5 5 5 5-5M5 20h14",
		arrow: "M5 12h14m-6-6 6 6-6 6",
	};
	return (
		<svg
			className={className}
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={paths[name]} />
		</svg>
	);
}

/** A command that copies itself, falling back to selecting its text. */
export function CopyCommand({ command, className, prompt }: { command: string; className?: string; prompt?: string }) {
	const [copied, setCopied] = useState<"" | "copied" | "select">("");
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
			setCopied("copied");
		} catch {
			const selection = window.getSelection();
			if (code.current && selection) {
				const range = document.createRange();
				range.selectNodeContents(code.current);
				selection.removeAllRanges();
				selection.addRange(range);
			}
			setCopied("select");
		}
		reset.current = setTimeout(() => setCopied(""), 2200);
	};
	return (
		<button
			type="button"
			className={className}
			data-copied={copied || undefined}
			aria-label={`Copy command: ${command}`}
			onClick={() => void copy()}
		>
			{prompt && <span className="m-prompt">{prompt}</span>}
			<code ref={code}>{command}</code>
			<span className="m-copy-state" aria-live="polite">
				{copied === "copied" ? (
					<Icon name="check" />
				) : copied === "select" ? (
					<span>select and copy</span>
				) : (
					<Icon name="copy" />
				)}
			</span>
		</button>
	);
}

/** Marks an element seen the first time it scrolls into view, for one-shot reveals. */
export function useSeen<T extends Element>(threshold = 0.35): [RefObject<T | null>, boolean] {
	const ref = useRef<T>(null);
	const [seen, setSeen] = useState(false);
	useEffect(() => {
		const element = ref.current;
		if (!element || seen) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setSeen(true);
					observer.disconnect();
				}
			},
			{ threshold },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [seen, threshold]);
	return [ref, seen];
}

/** True while the element is on screen, for loops that should rest offscreen. */
export function useOnScreen<T extends Element>(): [RefObject<T | null>, boolean] {
	const ref = useRef<T>(null);
	const [on, setOn] = useState(false);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new IntersectionObserver((entries) => setOn(entries.some((entry) => entry.isIntersecting)), {
			threshold: 0.2,
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [ref, on];
}
