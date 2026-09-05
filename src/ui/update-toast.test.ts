import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppUpdate } from "./desktop-bridge";
import { UpdateToastPill, updateToastBusy } from "./update-toast";

function render(update: AppUpdate): string {
	return renderToStaticMarkup(
		createElement(UpdateToastPill, { toast: { kind: "app", update }, onUpdate() {}, onDismiss() {} }),
	);
}

describe("the app update pill", () => {
	it("keeps preparing visible and busy without displaying a completed download", () => {
		const update: AppUpdate = { kind: "preparing", version: "0.17.0" };
		const html = render(update);
		expect(html).toContain("Preparing Spool 0.17.0");
		expect(html).not.toContain("100%");
		expect(html).not.toContain("Dismiss");
		expect(updateToastBusy({ kind: "app", update })).toBe(true);
	});

	it("offers retry only after the previous operation can safely be repeated", () => {
		const update: AppUpdate = { kind: "failed", version: "0.17.0", message: "Connection lost", retryable: true };
		expect(render(update)).toContain(">Retry</button>");
		expect(render({ ...update, retryable: false })).not.toContain(">Retry</button>");
		expect(render({ ...update, retryable: false })).toContain("Download Spool.dmg");
		expect(updateToastBusy({ kind: "app", update })).toBe(false);
	});

	it("shows checking without claiming a download has started", () => {
		const html = render({ kind: "checking", version: "0.17.0" });
		expect(html).toContain("Checking for updates");
		expect(html).not.toContain("Downloading");
		expect(html).not.toContain("Dismiss");
	});
});
