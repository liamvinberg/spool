import { type FakeAgentProc, fixtureAgentExecutor } from "../../test-helpers";
import { orderQuestion } from "./bundled-question";

/** A deterministic Claude wire peer, retaining the real adapter and live turn. */
export function permissionClaude() {
	let reject = false;
	let acknowledge = true;
	const changes: { proc: FakeAgentProc; id: string; mode: string }[] = [];
	const answers: string[] = [];
	const requests = [
		{
			id: "file",
			tool: "Write",
			input: { file_path: "src/ui/receipt.css", content: "receipt" },
			description: "Allow edits in src/ui/?",
		},
		{
			id: "command",
			tool: "Bash",
			input: { command: "printf receipt > outside" },
			description: "Allow commands to read and change files your account can access?",
		},
		{ id: "question", tool: "AskUserQuestion", input: { questions: [orderQuestion] }, description: null },
	];
	function reply(change: (typeof changes)[number], refused = reject) {
		change.proc.emit(
			JSON.stringify({
				type: "control_response",
				response: {
					subtype: refused ? "error" : "success",
					request_id: change.id,
					...(refused ? { error: "Claude Code refused this permission change." } : { response: {} }),
				},
			}),
		);
	}
	const fixture = fixtureAgentExecutor(
		(proc, line) => {
			const wire = JSON.parse(line) as {
				type?: string;
				request_id: string;
				request?: { subtype?: string; mode: string };
				response?: { request_id: string };
				message?: { content?: { text?: string }[] };
			};
			if (wire.type === "control_request") {
				if (wire.request?.subtype === "set_permission_mode") {
					const change = { proc, id: wire.request_id, mode: wire.request.mode };
					changes.push(change);
					if (acknowledge)
						reply(
							change,
							reject ||
								(change.mode === "bypassPermissions" &&
									!proc.spawn.args.includes("--allow-dangerously-skip-permissions")),
						);
				} else if (wire.request?.subtype === "list_models") {
					proc.emit(
						JSON.stringify({
							type: "control_response",
							response: {
								subtype: "success",
								request_id: wire.request_id,
								response: {
									models: [
										{
											value: "default",
											displayName: "Default (recommended)",
											description: "Claude Code default model",
										},
									],
								},
							},
						}),
					);
				} else if (wire.request?.subtype === "interrupt") {
					proc.emit(
						JSON.stringify({
							type: "result",
							subtype: "success",
							result: "Stopped",
							num_turns: 1,
							total_cost_usd: 0,
						}),
					);
				}
				return;
			}
			if (wire.type === "control_response" && wire.response) {
				answers.push(wire.response.request_id);
				return;
			}
			if (wire.type !== "user") return;
			const text = wire.message?.content?.map((block) => block.text ?? "").join(" ") ?? "";
			const at = proc.spawn.args.indexOf("--permission-mode");
			proc.emit(
				JSON.stringify({
					type: "system",
					subtype: "init",
					model: "claude-opus-5",
					session_id: "s",
					permissionMode: proc.spawn.args[at + 1],
				}),
			);
			if (text.startsWith("/model")) {
				proc.emit(
					JSON.stringify({
						type: "result",
						subtype: "success",
						result: "Current model: Default (recommended)",
						num_turns: 0,
						total_cost_usd: 0,
					}),
				);
				return;
			}
			for (const request of requests) {
				proc.emit(
					JSON.stringify({
						type: "control_request",
						request_id: request.id,
						request: {
							subtype: "can_use_tool",
							tool_name: request.tool,
							tool_use_id: request.id,
							input: request.input,
							description: request.description,
							requires_user_interaction: request.id === "question",
							permission_suggestions:
								request.id === "question"
									? []
									: [
											{
												type: "addRules",
												rules: [{ toolName: request.tool }],
												behavior: "allow",
												destination: "session",
											},
										],
						},
					}),
				);
			}
		},
		(proc) => proc.exit(0),
	);
	return {
		...fixture,
		changes,
		answers,
		reply,
		reject: (value: boolean) => {
			reject = value;
		},
		acknowledge: (value: boolean) => {
			acknowledge = value;
		},
	};
}
