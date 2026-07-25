import {
	type ClipboardCopyRequest,
	type ClipboardCopyResult,
	clipboardFailure,
	clipboardSuccess,
} from "./clipboard-protocol";

interface ClipboardWriter {
	writeText(text: string): Promise<void>;
}

/**
 * Invoke the trusted realm's clipboard immediately, then answer only through
 * the caller's already verified reply target.
 */
export function fulfillClipboardCopy(
	request: ClipboardCopyRequest,
	reply: (result: ClipboardCopyResult) => void,
	clipboard: ClipboardWriter | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
): void {
	let write: Promise<void>;
	try {
		if (clipboard === undefined || typeof clipboard.writeText !== "function") {
			throw new DOMException("Clipboard API is not available", "NotSupportedError");
		}
		write = clipboard.writeText(request.text);
	} catch (error) {
		send(reply, clipboardFailure(request.frame, request.id, error));
		return;
	}
	void Promise.resolve(write).then(
		() => send(reply, clipboardSuccess(request.frame, request.id)),
		(error) => send(reply, clipboardFailure(request.frame, request.id, error)),
	);
}

export function rejectClipboardCopy(
	request: ClipboardCopyRequest,
	reply: (result: ClipboardCopyResult) => void,
	error: unknown,
): void {
	send(reply, clipboardFailure(request.frame, request.id, error));
}

function send(reply: (result: ClipboardCopyResult) => void, message: ClipboardCopyResult): void {
	try {
		reply(message);
	} catch {
		// A navigation can destroy a captured reply target before the browser
		// settles its clipboard promise. The old request has nowhere safe to answer.
	}
}
