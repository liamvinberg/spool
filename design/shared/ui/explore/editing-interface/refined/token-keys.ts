import type { KeyboardEvent } from "react";

export function tokenKeys(event: KeyboardEvent<HTMLElement>) {
	if (
		!(event.target instanceof HTMLInputElement && event.target.classList.contains("ep-token-search")) &&
		event.target instanceof HTMLInputElement
	)
		return;
	if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
	if (event.target instanceof HTMLInputElement && ["Home", "End"].includes(event.key)) return;
	event.preventDefault();
	event.stopPropagation();
	const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".ep-color-options button")];
	const index = options.findIndex((option) => option === document.activeElement);
	const next =
		event.key === "Home"
			? 0
			: event.key === "End"
				? options.length - 1
				: (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length;
	options[next]?.focus({ preventScroll: true });
	options[next]?.scrollIntoView({ block: "nearest" });
}
