/** A staged project image is data; only the original source handle can refer to it. */
export type SourceImagePut = { kind: "existing"; path: string } | { kind: "file"; name: string; data: string };

export interface SourceImageExpectation {
	kind: "image";
	value: string;
	absent: boolean;
}

export type SourceImageStaged = { ok: true; path: string; value: string } | { ok: false; reason: string };
