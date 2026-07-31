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

const THREAD = "6a290038-7520-4555-aad3-fd3f462ab402";

/** one open turn stream, held so a test can drop it the way a network does */
function turnStream() {
	const encoder = new TextEncoder();
	let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined;
	const stream = new ReadableStream<Uint8Array>({
		start: (controller) => {
			ctrl = controller;
		},
	});
	return {
		response: () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
		push: (event: string, data: unknown) =>
			ctrl?.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
		/** the socket going, which says nothing at all about the process on the other end */
		drop: () => ctrl?.close(),
	};
}

describe("following a turn", () => {
	it("goes back for the turn from the event it reached, rather than ending it", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		const opened: string[] = [];
		const streams = [turnStream(), turnStream()];
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			opened.push(url.pathname + url.search);
			return Promise.resolve((streams[opened.length - 1] ?? turnStream()).response());
		});
		vi.stubGlobal("fetch", fetchMock);
		const { followAgentTurn } = await loadApi();

		const ends: unknown[] = [];
		const events: unknown[] = [];
		const letGo = followAgentTurn(
			"demo",
			{ say: { thread: THREAD, turn: "t1", saying: [{ prompt: "go" }] } },
			{ event: (event) => events.push(event), end: (ending) => ends.push(ending) },
		);
		await vi.waitFor(() => expect(opened).toHaveLength(1));
		streams[0]?.push("agent", { kind: "waiting", parent: null });
		streams[0]?.push("agent", { kind: "speaking", message: "m", model: "opus", parent: null });
		await vi.waitFor(() => expect(events).toHaveLength(2));

		// two seconds of dropped wifi, which used to draw the turn as over and fire the
		// queue into a thread the daemon was still running one in
		streams[0]?.drop();
		await vi.waitFor(() => expect(opened).toHaveLength(2));

		// nothing ended, and the second read asks for the turn from the third event
		expect(ends).toEqual([]);
		expect(opened[1]).toBe(`/api/p/demo/agent/turn/${THREAD}?from=2`);
		letGo();
	});

	it("ends the turn on the daemon's own word for it and on nothing else", async () => {
		const stream = turnStream();
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stream.response()));
		const { followAgentTurn } = await loadApi();

		const ends: unknown[] = [];
		followAgentTurn("demo", { attach: { thread: THREAD } }, { event: () => {}, end: (ending) => ends.push(ending) });
		await vi.waitFor(() => expect(ends).toEqual([]));
		stream.push("agent", { kind: "closed", code: 0, parent: null });
		stream.drop();

		await vi.waitFor(() => expect(ends).toEqual([{ kind: "ended" }]));
	});

	it("reads attach's 404 as the turn being gone, never as an error to draw", async () => {
		// the daemon's own body for a thread it is holding nothing for — it was drawn
		// into the log verbatim the first time a restart outlived the turns its
		// rails were reading
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response('no turn to read in thread "6a290038"', { status: 404 })),
		);
		const { followAgentTurn } = await loadApi();

		const ending = await new Promise((resolve) => {
			followAgentTurn("demo", { attach: { thread: THREAD } }, { event: () => {}, end: resolve });
		});
		expect(ending).toEqual({ kind: "cut" });
	});

	it("still reports a refusal that is not the ordinary answer", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("the daemon fell over", { status: 500 })));
		const { followAgentTurn } = await loadApi();

		const ending = await new Promise((resolve) => {
			followAgentTurn("demo", { attach: { thread: THREAD } }, { event: () => {}, end: resolve });
		});
		expect(ending).toEqual({ kind: "refused", status: 500, why: "the daemon fell over" });
	});

	it("says the turn is already running rather than starting a second one", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(`a turn is already running in thread "${THREAD}"`, { status: 409 })),
		);
		const { followAgentTurn } = await loadApi();

		const ending = await new Promise((resolve) => {
			followAgentTurn(
				"demo",
				{ say: { thread: THREAD, turn: "t1", saying: [{ prompt: "go" }] } },
				{ event: () => {}, end: resolve },
			);
		});
		expect(ending).toMatchObject({ kind: "refused", status: 409 });
	});

	it("never opens the door that says something twice", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		const opened: string[] = [];
		const streams = [turnStream(), turnStream()];
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
				opened.push(`${input instanceof Request ? input.method : (init?.method ?? "GET")} ${url.pathname}`);
				return Promise.resolve((streams[opened.length - 1] ?? turnStream()).response());
			}),
		);
		const { followAgentTurn } = await loadApi();

		const letGo = followAgentTurn(
			"demo",
			{ say: { thread: THREAD, turn: "t1", saying: [{ prompt: "go" }] } },
			{ event: () => {}, end: () => {} },
		);
		await vi.waitFor(() => expect(opened).toHaveLength(1));
		streams[0]?.drop();
		await vi.waitFor(() => expect(opened).toHaveLength(2));

		// the prompt has already been answered, so a second POST would spawn a second
		// agent against it: everything after the first read goes up the attach door
		expect(opened[0]).toBe("POST /api/p/demo/agent/turn");
		expect(opened[1]).toBe(`GET /api/p/demo/agent/turn/${THREAD}`);
		letGo();
	});
});
