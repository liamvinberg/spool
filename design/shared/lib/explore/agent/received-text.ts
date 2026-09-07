export interface TextArrival {
	readonly at: number;
	readonly text: string;
}

export interface TextRecording {
	readonly source: string;
	readonly model: string;
	readonly timing: "recorded" | "estimated";
	readonly prompt: string | null;
	readonly finishedAt: number;
	readonly arrivals: readonly TextArrival[];
}

/** Replay only complete received chunks. Nothing is filled in between them. */
export function receivedAt(recording: TextRecording, elapsed: number): string {
	let text = "";
	for (const arrival of recording.arrivals) {
		if (arrival.at > elapsed) break;
		text += arrival.text;
	}
	return text;
}
