// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchThumb } from "./api";
import { Thumbnail } from "./thumbnail";

vi.mock("./api", () => ({ fetchThumb: vi.fn() }));

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Thumbnail", () => {
	it("turns an authenticated thumbnail read into a short-lived image URL", async () => {
		vi.mocked(fetchThumb).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
		const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:trusted-thumbnail");
		const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		const host = document.createElement("div");
		const root = createRoot(host);

		await act(async () => {
			root.render(
				createElement(Thumbnail, {
					project: "demo",
					frame: "home",
					nonce: 4,
					alt: "home",
				}),
			);
		});

		expect(fetchThumb).toHaveBeenCalledWith("demo", "home", 4);
		expect(createObjectUrl).toHaveBeenCalledOnce();
		expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:trusted-thumbnail");

		act(() => root.unmount());
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:trusted-thumbnail");
	});
});
