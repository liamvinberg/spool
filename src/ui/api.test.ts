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
	vi.restoreAllMocks();
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

	it("reads a cover with no credential but its own address", async () => {
		const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });
		const fetchMock = vi.fn().mockResolvedValue(new Response(jpeg, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const { fetchCover } = await loadApi();
		const hash = "b".repeat(32);

		await expect(fetchCover("demo project", "home/card", { hash })).resolves.toBeInstanceOf(Blob);

		const call = fetchMock.mock.calls[0] ?? [];
		expect(new URL(String(call[0]), window.location.href).pathname).toBe(
			`/covers/demo%20project/home%2Fcard/${hash}`,
		);
		// the hash is the credential: an <img> cannot carry the control header
		expect(headersOf(call).get("x-spool-control")).toBeNull();
	});

	it("uses authenticated keepalive fetches for covers and staged trash", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ hash: "c".repeat(32) }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const { beaconTrash, putCover } = await loadApi();

		await expect(putCover("demo", "home", new Blob(["jpeg"]))).resolves.toEqual({ hash: "c".repeat(32) });
		beaconTrash("demo", ["home"]);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		for (const call of fetchMock.mock.calls) {
			expect(headersOf(call).get("x-spool-control")).toBe("control-test-token");
		}
		const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
		expect([...body.keys()]).toEqual(["cover"]);
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

	it("backs further off each time a daemon that is down refuses, until disposed", async () => {
		vi.useFakeTimers();
		// the bottom of each jittered step, so the waits are the ones being asserted
		vi.spyOn(Math, "random").mockReturnValue(0);
		const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
		vi.stubGlobal("fetch", fetchMock);
		const { subscribeSse } = await loadApi();

		const dispose = subscribeSse("/api/events", {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// 250, 500, 1000, 2000: a daemon nobody restarted is knocked on less and
		// less rather than twice a second for as long as the tab is open
		for (const wait of [250, 500, 1_000, 2_000]) {
			await vi.advanceTimersByTimeAsync(wait - 1);
			const before = fetchMock.mock.calls.length;
			await vi.advanceTimersByTimeAsync(1);
			expect(fetchMock.mock.calls.length).toBe(before + 1);
		}

		dispose();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(5);
	});

	it("retries at the base wait again once a connection has delivered something", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const spoken = () =>
			new Response(
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(": beat\n\n"));
						controller.close();
					},
				}),
				{ status: 200 },
			);
		const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementation(spoken);
		vi.stubGlobal("fetch", fetchMock);
		const { subscribeSse } = await loadApi();

		const dispose = subscribeSse("/api/events", {});
		await vi.advanceTimersByTimeAsync(250);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		// the second connection said something before ending, so the daemon is up
		// and the drop was this stream's: the count starts over
		await vi.advanceTimersByTimeAsync(250);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		dispose();
	});

	it("hangs up on a stream that has gone quiet, and leaves a beating one alone", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
		const fetchMock = vi.fn((_url: unknown, init?: RequestInit) =>
			Promise.resolve(
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							streams.push(controller);
							init?.signal?.addEventListener("abort", () => controller.error(new Error("hung up")));
						},
					}),
					{ status: 200 },
				),
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { subscribeSse, SSE_SILENCE_MS } = await loadApi();

		const dispose = subscribeSse("/api/events", {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// a beat is not an event, and it is the whole of what keeps the stream
		await vi.advanceTimersByTimeAsync(SSE_SILENCE_MS - 1_000);
		streams[0]?.enqueue(new TextEncoder().encode(": beat\n\n"));
		await vi.advanceTimersByTimeAsync(SSE_SILENCE_MS - 1_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// nothing after that: the connection is treated as gone rather than waited on
		await vi.advanceTimersByTimeAsync(SSE_SILENCE_MS + 1_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		dispose();
	});

	it("checks its stream the moment the tab comes back, rather than waiting out the watchdog", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const fetchMock = vi.fn((_url: unknown, init?: RequestInit) =>
			Promise.resolve(
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							init?.signal?.addEventListener("abort", () => controller.error(new Error("hung up")));
						},
					}),
					{ status: 200 },
				),
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { subscribeSse } = await loadApi();

		const dispose = subscribeSse("/api/events", {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// the laptop slept: the clock moved and no timer ran, which is exactly the
		// half-open connection the watchdog cannot have noticed
		vi.setSystemTime(Date.now() + 20 * 60_000);
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(250);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		dispose();
	});

	it("tells the subscriber about a connection that came back, never about the first one", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const spoken = () =>
			new Response(
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('event: hello\ndata: {"project":"demo"}\n\n'));
						controller.close();
					},
				}),
				{ status: 200 },
			);
		vi.stubGlobal("fetch", vi.fn(spoken));
		const { subscribeSse } = await loadApi();
		const onReconnect = vi.fn();

		const dispose = subscribeSse("/api/p/demo/events", {}, { onReconnect });
		await vi.advanceTimersByTimeAsync(0);
		expect(onReconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(250);
		expect(onReconnect).toHaveBeenCalledTimes(1);
		dispose();
	});
});

describe("picking a turn back up", () => {
	it("reads attach's 404 as the ordinary answer, never as an error to draw", async () => {
		// the daemon's own body for a thread that is not mid-turn — it was drawn
		// into the log verbatim the first time a restart outlived the turns its
		// rails were reading
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response('no turn to read in thread "6a290038"', { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);
		const { attachAgentTurn } = await loadApi();

		const ended = await new Promise<string | undefined>((resolve) => {
			attachAgentTurn("demo", "6a290038-7520-4555-aad3-fd3f462ab402", 0, { event: () => {}, end: resolve });
		});
		expect(ended).toBeUndefined();
	});

	it("still reports a failure that is not the ordinary answer", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response("the daemon fell over", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);
		const { attachAgentTurn } = await loadApi();

		const ended = await new Promise<string | undefined>((resolve) => {
			attachAgentTurn("demo", "6a290038-7520-4555-aad3-fd3f462ab402", 0, { event: () => {}, end: resolve });
		});
		expect(ended).toBe("the daemon fell over");
	});
});
