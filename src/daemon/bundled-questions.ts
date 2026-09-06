import { randomUUID } from "node:crypto";
import { type Static, Type } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type AgentReply, wordsOf } from "./agent-control";
import type { AgentAsking, AgentEvent } from "./agent-events";
import { bundledAnswerFits } from "./bundled-protocol";

const parameters = Type.Object({
	questions: Type.Array(
		Type.Object({
			header: Type.String({ description: "Short name for this decision." }),
			question: Type.String({ minLength: 1 }),
			options: Type.Array(Type.Object({ label: Type.String({ minLength: 1 }), description: Type.String() }), {
				minItems: 2,
				maxItems: 4,
			}),
		}),
		{ minItems: 1, maxItems: 4 },
	),
});
export type BundledQuestions = Static<typeof parameters>;
type QuestionReply = Extract<AgentReply, { kind: "said" | "picked" | "deny" }>;

/** Questions have no permission mode or grant: only their own answer or cancellation settles them. */
export class BundledQuestionTurn {
	private readonly pending = new Map<string, { asking: AgentAsking; finish: (reply: QuestionReply | null) => void }>();
	private stopped = false;
	constructor(private emit: (event: AgentEvent) => void) {}
	begin(emit: (event: AgentEvent) => void): void {
		this.emit = emit;
		this.stopped = false;
	}
	answer(request: string, reply: AgentReply): boolean {
		const held = this.pending.get(request);
		if (!held || reply.kind === "allow" || reply.kind === "always" || !bundledAnswerFits(held.asking, reply))
			return false;
		this.pending.delete(request);
		this.emit({ kind: "answered", request, answer: reply.kind, words: wordsOf(reply), parent: null });
		held.finish(reply);
		return true;
	}
	stop(): void {
		this.stopped = true;
		for (const [request, held] of this.pending) {
			this.pending.delete(request);
			held.finish(null);
		}
	}
	tool(): ToolDefinition<typeof parameters> {
		return {
			name: "ask_person",
			label: "Ask the person",
			description:
				"Ask the person a design question and wait for their answer. Offer two to four choices with full descriptions. They may choose an option, type their own answer, or dismiss the question. A dismissed question has no answer: stop and wait for them. Permission modes never answer design questions.",
			parameters,
			executionMode: "sequential",
			execute: async (id, input, signal) => {
				if (this.stopped || signal?.aborted) throw new Error("Question stopped");
				if (new Set(input.questions.map((question) => question.question)).size !== input.questions.length)
					throw new Error("Each question must have a distinct sentence");
				if (
					input.questions.some(
						(question) =>
							new Set(question.options.map((option) => option.label)).size !== question.options.length,
					)
				)
					throw new Error("Each option must have a distinct label");
				const request = randomUUID();
				const asking: AgentAsking = {
					kind: "asking",
					request,
					call: id,
					tool: "AskUserQuestion",
					display: null,
					input,
					description: null,
					interaction: true,
					suggestions: [],
					parent: null,
				};
				this.emit({ kind: "called", id, tool: "AskUserQuestion", input, parent: null });
				const reply = await new Promise<QuestionReply | null>((resolve) => {
					const abort = () => {
						this.pending.delete(request);
						finish(null);
					};
					const finish = (value: QuestionReply | null) => {
						signal?.removeEventListener("abort", abort);
						resolve(value);
					};
					this.pending.set(request, { asking, finish });
					signal?.addEventListener("abort", abort, { once: true });
					this.emit(asking);
				});
				const text =
					reply === null
						? "Question stopped without an answer."
						: reply.kind === "deny"
							? "The user dismissed the question without answering it. Stop and wait for them."
							: JSON.stringify(reply.kind === "said" ? { response: reply.text } : { answers: reply.picks });
				this.emit({ kind: "result", id, failed: reply === null, text, images: [], parent: null });
				if (reply === null) throw new Error(text);
				return { content: [{ type: "text", text }], details: {} };
			},
		};
	}
}
