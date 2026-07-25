export interface ClipboardCopyRequest {
	spool: "copy";
	frame: string;
	id: number;
	text: string;
}

export interface ClipboardError {
	name: string;
	message: string;
}

export type ClipboardCopyResult =
	| { spool: "copy-result"; frame: string; id: number }
	| { spool: "copy-result"; frame: string; id: number; error: ClipboardError };

const ERROR_MESSAGE_MAX = 4096;

export function parseClipboardCopyRequest(value: unknown): ClipboardCopyRequest | undefined {
	if (!isRecord(value) || !hasExactKeys(value, ["spool", "frame", "id", "text"])) return undefined;
	if (value.spool !== "copy" || typeof value.frame !== "string" || !isRequestId(value.id)) return undefined;
	return typeof value.text === "string" ? (value as unknown as ClipboardCopyRequest) : undefined;
}

export function parseClipboardCopyResult(value: unknown): ClipboardCopyResult | undefined {
	if (!isRecord(value) || value.spool !== "copy-result") return undefined;
	if (typeof value.frame !== "string" || !isRequestId(value.id)) return undefined;
	if (hasExactKeys(value, ["spool", "frame", "id"])) {
		return value as unknown as ClipboardCopyResult;
	}
	if (!hasExactKeys(value, ["spool", "frame", "id", "error"]) || !isClipboardError(value.error)) {
		return undefined;
	}
	return value as unknown as ClipboardCopyResult;
}

export function clipboardSuccess(frame: string, id: number): ClipboardCopyResult {
	return { spool: "copy-result", frame, id };
}

export function clipboardFailure(frame: string, id: number, value: unknown): ClipboardCopyResult {
	return { spool: "copy-result", frame, id, error: safeClipboardError(value) };
}

function safeClipboardError(value: unknown): ClipboardError {
	if (isRecord(value)) {
		try {
			if (safeName(value.name) && safeMessage(value.message)) {
				return { name: value.name, message: value.message };
			}
		} catch {
			return { name: "Error", message: "Clipboard write failed" };
		}
	}
	return { name: "Error", message: safeString(value) };
}

function isClipboardError(value: unknown): value is ClipboardError {
	return (
		isRecord(value) && hasExactKeys(value, ["name", "message"]) && safeName(value.name) && safeMessage(value.message)
	);
}

function safeName(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function safeMessage(value: unknown): value is string {
	return typeof value === "string";
}

function safeString(value: unknown): string {
	try {
		return String(value).slice(0, ERROR_MESSAGE_MAX);
	} catch {
		return "Clipboard write failed";
	}
}

function isRequestId(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const own = Object.keys(value);
	return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
