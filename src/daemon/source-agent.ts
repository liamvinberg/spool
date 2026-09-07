import type { EngineTurnOptions } from "./agent-engine";
import type { ExecutedEdit } from "./bundled-editor";

/** Private host IPC only. These records never enter tool inputs or results. */
export type SourceAgentRequest =
	| { kind: "read"; path: string }
	| { kind: "discard"; handle: string }
	| { kind: "read-complete"; handle: string; complete: boolean }
	| { kind: "prepare"; path: string; operation: "edit" | "write" }
	| { kind: "replace"; handle: string; output: string; edits: ExecutedEdit[] | null }
	| { kind: "acknowledge"; handle: string; complete: boolean };
export type SourceAgentReply =
	| { kind: "outside" }
	| { kind: "read"; handle: string; bytes: string }
	| { kind: "prepared"; handle: string; bytes: string | null }
	| { kind: "replaced"; output: string }
	| { kind: "done" };
export interface SourceAgentAuthority {
	unknown?(): boolean;
	request(request: SourceAgentRequest): Promise<SourceAgentReply>;
	revoke(): void;
}
export interface SourceAgentSupervisor {
	open(options: EngineTurnOptions, generation: string): SourceAgentAuthority;
}
export interface SourceAgentClient {
	request(request: SourceAgentRequest): Promise<SourceAgentReply>;
}
