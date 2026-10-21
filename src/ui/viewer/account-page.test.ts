// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { AccountPage, day, teamsLine } from "./account-page";
import type { AccountSource } from "./account-source";

describe("the account page's words", () => {
	it("names the teams the account is in, or says there are none", () => {
		expect(teamsLine([])).toBe("Not in a team yet.");
		expect(teamsLine(["Tidemark"])).toBe("In Tidemark.");
		expect(teamsLine(["Tidemark", "Northlight", "Client Co"])).toBe("In Tidemark, Northlight and Client Co.");
	});

	it("says a day as people do: today, yesterday, then the date, with the year only when it isn't this one", () => {
		const now = new Date(2026, 9, 12, 15).getTime() / 1000;
		expect(day(new Date(2026, 9, 12, 1).getTime() / 1000, now)).toBe("today");
		expect(day(new Date(2026, 9, 11, 23).getTime() / 1000, now)).toBe("yesterday");
		expect(day(new Date(2026, 9, 8, 12).getTime() / 1000, now)).toMatch(/^8 Oct$/u);
		expect(day(new Date(2025, 11, 30, 12).getTime() / 1000, now)).toMatch(/^30 Dec 2025$/u);
	});
});

describe("the account page", () => {
	it("ends with Delete account, which goes to spool.page's own page to confirm it", async () => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const source: AccountSource = {
			summary: async () => ({
				email: "ada@tidemark.app",
				name: "Ada",
				commentEmails: "for-you",
				macs: [],
				passkeys: [],
			}),
			rename: async () => true,
			setCommentEmails: async () => {},
			revokeMac: async () => {},
			removePasskey: async () => {},
			addPasskey: async () => {},
			passkeys: () => false,
		};
		const onDelete = vi.fn();
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
			vi.unstubAllGlobals();
		});
		await act(async () => {
			root.render(
				createElement(AccountPage, {
					source,
					teams: ["Tidemark"],
					onSignedOut: () => {},
					onSignOut: () => {},
					onDelete,
				}),
			);
		});

		const sections = Array.from(host.querySelectorAll("section"));
		const last = sections.at(-1);
		expect(last?.getAttribute("aria-label")).toBe("Delete account");
		expect(last?.textContent).toContain(
			"Your teams keep your work. Your Macs stop syncing, and their folders stay on them as ordinary local projects.",
		);
		const button = Array.from(last?.querySelectorAll("button") ?? []).find(
			(each) => each.textContent === "Delete account…",
		);
		act(() => button?.click());
		expect(onDelete).toHaveBeenCalledOnce();
	});
});
