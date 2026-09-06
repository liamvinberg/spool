// Evaluated by the test's inspector connection in an unmodified installed host.
// Only HTTP replies are simulated. Native provider parsing and tools stay real.
(() => {
	const { appendFileSync, existsSync, readFileSync } = process.getBuiltinModule("node:fs");
	let sequence = 0;
	globalThis.fetch = async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		const catalog = `${process.env.SPOOL_BUNDLED_STATE}/installed-catalog-response.json`;
		if (url.endsWith("/api/models/providers/openai") && existsSync(catalog))
			return new Response(readFileSync(catalog, "utf8"), {
				headers: { "content-type": "application/json", "last-modified": "Fri, 01 Jan 2100 00:00:00 GMT" },
			});
		if (!url.includes("/responses")) return new Response("Offline fixture", { status: 503 });
		const body = JSON.parse(init?.body ?? "{}");
		appendFileSync(`${process.env.SPOOL_BUNDLED_STATE}/installed-http.jsonl`, `${JSON.stringify(body)}\n`);
		const inputs = body.input ?? [];
		const userAt = inputs.findLastIndex((item) => item.role === "user");
		const user = inputs[userAt];
		const prompt =
			typeof user?.content === "string"
				? user.content
				: (user?.content ?? []).map((part) => part.text ?? "").join("\n");
		const marker = "installed tools: ";
		const position = prompt.indexOf(marker);
		const script = position < 0 ? [] : JSON.parse(prompt.slice(position + marker.length));
		const completed = inputs.slice(userAt + 1).filter((item) => item.type === "function_call_output").length;
		const step = script[completed];
		const id = `fixture_${++sequence}`;
		const item = step
			? {
					type: "function_call",
					id: `fc_${id}`,
					call_id: id,
					name: step.name,
					arguments: JSON.stringify(step.arguments),
					status: "completed",
				}
			: {
					type: "message",
					id: `msg_${id}`,
					role: "assistant",
					status: "completed",
					content: [{ type: "output_text", text: "Installed journey complete.", annotations: [] }],
				};
		const events = [
			{ type: "response.created", response: { id } },
			{ type: "response.output_item.added", output_index: 0, item },
			{ type: "response.output_item.done", output_index: 0, item },
			{
				type: "response.completed",
				response: {
					id,
					status: "completed",
					output: [item],
					usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
				},
			},
		];
		if (prompt.includes("hold installed turn") && !step) {
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(events[0])}\n\n`));
						init?.signal?.addEventListener("abort", () => controller.error(new Error("Aborted")), { once: true });
					},
				}),
				{ headers: { "content-type": "text/event-stream" } },
			);
		}
		return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
			headers: { "content-type": "text/event-stream" },
		});
	};
	return {
		pid: process.pid,
		executable: process.execPath,
		node: process.version,
		electron: process.versions.electron ?? null,
	};
})();
