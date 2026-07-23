import { useEffect, useId, useRef } from "react";
import { SPOOL_MARK_PATH } from "../brand";

export function ExternalLinkDialog({ href, onStay, onOpen }: { href: string; onStay: () => void; onOpen: () => void }) {
	const titleId = useId();
	const url = new URL(href);
	const backdropRef = useRef<HTMLDivElement | null>(null);
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const stayRef = useRef<HTMLButtonElement | null>(null);
	const onStayRef = useRef(onStay);
	onStayRef.current = onStay;

	useEffect(() => {
		const previousFocus = document.activeElement;
		const backdrop = backdropRef.current;
		stayRef.current?.focus({ preventScroll: true });
		const blockPointer = (event: Event) => event.stopPropagation();
		const blockWheel = (event: WheelEvent) => {
			event.preventDefault();
			event.stopPropagation();
		};
		const dismiss = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopImmediatePropagation();
				onStayRef.current();
				return;
			}
			if (event.key !== "Tab") return;
			const dialog = dialogRef.current;
			const focusable =
				dialog === null ? [] : [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
			const first = focusable[0];
			const last = focusable.at(-1);
			if (first === undefined || last === undefined) return;
			const active = document.activeElement;
			const wrapBack = event.shiftKey && (active === first || !dialog?.contains(active));
			const wrapForward = !event.shiftKey && (active === last || !dialog?.contains(active));
			if (!wrapBack && !wrapForward) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			(wrapBack ? last : first).focus({ preventScroll: true });
		};
		backdrop?.addEventListener("pointerdown", blockPointer);
		backdrop?.addEventListener("dblclick", blockPointer);
		backdrop?.addEventListener("contextmenu", blockPointer);
		backdrop?.addEventListener("wheel", blockWheel, { passive: false });
		window.addEventListener("keydown", dismiss, { capture: true });
		return () => {
			backdrop?.removeEventListener("pointerdown", blockPointer);
			backdrop?.removeEventListener("dblclick", blockPointer);
			backdrop?.removeEventListener("contextmenu", blockPointer);
			backdrop?.removeEventListener("wheel", blockWheel);
			window.removeEventListener("keydown", dismiss, { capture: true });
			if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
		};
	}, []);

	return (
		<div ref={backdropRef} className="spool-external-backdrop">
			<style>{EXTERNAL_LINK_DIALOG_CSS}</style>
			<div
				ref={dialogRef}
				className="spool-external-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<header className="spool-external-header">
					<span className="spool-external-brand">
						<svg viewBox="250 182 524 660" aria-hidden="true">
							<path d={SPOOL_MARK_PATH} fillRule="evenodd" />
						</svg>
						<span>spool</span>
					</span>
					<button type="button" className="spool-external-close" aria-label="Stay on this page" onClick={onStay}>
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<path d="M4 4 L12 12 M12 4 L4 12" />
						</svg>
					</button>
				</header>
				<div className="spool-external-body">
					<div className="spool-external-copy">
						<h2 id={titleId}>Open external link?</h2>
						<p>
							This page sits outside the prototype. It will open in your browser and this frame will stay exactly
							as it is.
						</p>
					</div>
					<div className="spool-external-destination">
						<span>Destination</span>
						<strong>{displayUrl(url)}</strong>
					</div>
					<div className="spool-external-actions">
						<button ref={stayRef} type="button" className="spool-external-stay" onClick={onStay}>
							Stay here
						</button>
						<a
							className="spool-external-open"
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(event) => {
								event.stopPropagation();
								onOpen();
							}}
						>
							Open {url.host}
							<svg viewBox="0 0 16 16" aria-hidden="true">
								<path d="M6 4 H12 V10 M12 4 L4 12" />
							</svg>
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}

function displayUrl(url: URL): string {
	return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

const EXTERNAL_LINK_DIALOG_CSS = `
	.spool-external-backdrop {
		position: absolute;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		container-type: inline-size;
		padding: clamp(16px, 5cqi, 48px);
		background: rgb(15 15 15 / 78%);
		font-family: "Familjen Grotesk Variable", ui-sans-serif, system-ui, sans-serif;
		color: #f2f0eb;
		pointer-events: auto;
	}

	.spool-external-backdrop *,
	.spool-external-backdrop *::before,
	.spool-external-backdrop *::after {
		box-sizing: border-box;
	}

	.spool-external-dialog {
		width: min(520px, 100%);
		overflow: hidden;
		border: 1px solid #34322f;
		border-radius: 14px;
		background: #171716;
	}

	.spool-external-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 52px;
		padding: 0 14px 0 18px;
		border-bottom: 1px solid #2d2c29;
	}

	.spool-external-brand {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.spool-external-brand svg {
		width: 11px;
		height: 16px;
		fill: #f04a2b;
	}

	.spool-external-close {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: #8d8b85;
		cursor: pointer;
	}

	.spool-external-close:hover {
		background: #232321;
		color: #f2f0eb;
	}

	.spool-external-close:focus-visible,
	.spool-external-stay:focus-visible,
	.spool-external-open:focus-visible {
		outline: 2px solid #f04a2b;
		outline-offset: 2px;
	}

	.spool-external-close svg {
		width: 13px;
		height: 13px;
	}

	.spool-external-close path,
	.spool-external-open path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.spool-external-body {
		display: grid;
		gap: 28px;
		padding: 32px;
	}

	.spool-external-copy {
		display: grid;
		gap: 10px;
	}

	.spool-external-copy h2 {
		margin: 0;
		font: inherit;
		font-size: 25px;
		font-weight: 580;
		line-height: 1.08;
		letter-spacing: -0.035em;
		color: #f2f0eb;
	}

	.spool-external-copy p {
		max-width: 410px;
		margin: 0;
		font-size: 14px;
		line-height: 1.55;
		color: #aaa7a0;
	}

	.spool-external-destination {
		display: grid;
		gap: 7px;
		min-width: 0;
	}

	.spool-external-destination span {
		font-family: "Fragment Mono", ui-monospace, monospace;
		font-size: 10px;
		line-height: 1;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #77746e;
	}

	.spool-external-destination strong {
		overflow: hidden;
		padding: 11px 12px;
		border: 1px solid #302f2c;
		border-radius: 7px;
		background: #111110;
		font-family: "Fragment Mono", ui-monospace, monospace;
		font-size: 11px;
		font-weight: 400;
		line-height: 1.35;
		color: #c9c6bf;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.spool-external-actions {
		display: flex;
		justify-content: flex-end;
		gap: 9px;
	}

	.spool-external-stay,
	.spool-external-open {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 38px;
		margin: 0;
		padding: 0 15px;
		border-radius: 7px;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		line-height: 1;
		text-decoration: none;
		cursor: pointer;
	}

	.spool-external-stay {
		border: 1px solid #3b3935;
		background: transparent;
		color: #d1cec7;
	}

	.spool-external-stay:hover {
		border-color: #57534d;
		color: #f2f0eb;
	}

	.spool-external-open {
		gap: 8px;
		border: 1px solid #f04a2b;
		background: #f04a2b;
		color: #181412;
	}

	.spool-external-open:hover {
		border-color: #ff5c3c;
		background: #ff5c3c;
	}

	.spool-external-open svg {
		width: 14px;
		height: 14px;
	}

	@container (max-width: 430px) {
		.spool-external-body {
			gap: 22px;
			padding: 24px;
		}

		.spool-external-copy h2 {
			font-size: 22px;
		}

		.spool-external-actions {
			display: grid;
		}

		.spool-external-stay,
		.spool-external-open {
			width: 100%;
		}
	}
`;
