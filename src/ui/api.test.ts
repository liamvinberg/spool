// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadApi() {
	vi.resetModules();
	Object.defineProperty(window, "__SPOOL_CONTROL__", { configurable: true, value: "control-test-token" });
	Object.defineProperty(window, "__SPOOL_RENDER_ORIGIN__", {
		configurable: true,
		value: "http://run.spool.localhost:7766",
	});
	Object.defineProperty(window, "__SPOOL_CAPTURE_ORIGIN__", {
		configurable: true,
		value: "http://capture-spool.localhost:7766",
	});
	return import("./api");
}

function headersOf(call: unknown[]): Headers {
	return new Request(call[0] as RequestInfo | URL, call[1] as RequestInit | undefined).headers;
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	delete (window as Window & { __SPOOL_CONTROL__?: string }).__SPOOL_CONTROL__;
	delete (window as Window & { __SPOOL_RENDER_ORIGIN__?: string }).__SPOOL_RENDER_ORIGIN__;
	delete (window as Window & { __SPOOL_CAPTURE_ORIGIN__?: string }).__SPOOL_CAPTURE_ORIGIN__;
});

describe("trusted UI API client", () => {
	it("loads before boot config is available", async () => {
		vi.resetModules();
		delete (window as Window & { __SPOOL_CONTROL__?: string }).__SPOOL_CONTROL__;

		await expect(import("./api")).resolves.toBeDefined();
	});

	it("attaches the control token to typed control requests", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [] }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const { fetchProjects } = await loadApi();

		await fetchProjects();

		expect(headersOf(fetchMock.mock.calls[0] ?? []).get("x-spool-control")).toBe("control-test-token");
	});

	it("points frame documents at the isolated render host", async () => {
		const { frameDocumentUrl } = await loadApi();

		expect(frameDocumentUrl("demo project", "home/card", 2)).toBe(
			"http://run.spool.localhost:7766/p/demo%20project/frames/home%2Fcard?v=2",
		);
	});

	it("reads the isolated capture host from trusted boot config", async () => {
		const { captureOrigin } = await loadApi();

		expect(captureOrigin).toBe("http://capture-spool.localhost:7766");
	});

	it("reads thumbnails through the authenticated control client", async () => {
		const png = new Blob(["png"], { type: "image/png" });
		const fetchMock = vi.fn().mockResolvedValue(new Response(png, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const { fetchThumb } = await loadApi();

		await expect(fetchThumb("demo project", "home/card", 3)).resolves.toBeInstanceOf(Blob);

		const call = fetchMock.mock.calls[0] ?? [];
		expect(new URL(String(call[0]), window.location.href).pathname).toBe("/api/p/demo%20project/thumbs/home%2Fcard");
		expect(new URL(String(call[0]), window.location.href).search).toBe("?v=3");
		expect(headersOf(call).get("x-spool-control")).toBe("control-test-token");
	});

	it("uses authenticated keepalive fetches for binary writes and staged trash", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		const { beaconTrash, putThumb } = await loadApi();

		await putThumb("demo", "home", new Blob(["png"]));
		beaconTrash("demo", ["home"]);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		for (const call of fetchMock.mock.calls) {
			expect(headersOf(call).get("x-spool-control")).toBe("control-test-token");
		}
		expect((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.keepalive).toBe(true);
	});

	it("reads project events through an authenticated fetch stream", async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('event: change\ndata: {"kind":"thumb"}\n\n'));
				controller.close();
			},
		});
		const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const { subscribeSse } = await loadApi();
		const change = vi.fn();

		const dispose = subscribeSse("/api/p/demo/events", { change });

		await vi.waitFor(() => expect(change).toHaveBeenCalledWith({ kind: "thumb" }));
		expect(headersOf(fetchMock.mock.calls[0] ?? []).get("x-spool-control")).toBe("control-test-token");
		dispose();
	});

	it("reconnects event streams after failures and EOF until disposed", async () => {
		vi.useFakeTimers();
		const closed = () =>
			new Response(
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.close();
					},
				}),
				{ status: 200 },
			);
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(closed())
			.mockImplementation(
				() =>
					new Promise<Response>(() => {
						// keeps the final connection open until disposal
					}),
			);
		vi.stubGlobal("fetch", fetchMock);
		const { subscribeSse } = await loadApi();

		const dispose = subscribeSse("/api/events", {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(500);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(500);
		expect(fetchMock).toHaveBeenCalledTimes(3);

		dispose();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});
