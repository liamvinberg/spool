import type { ComponentType } from "react";

export interface SpoolUi {
	readonly state: Record<string, unknown>;
	use(): Record<string, unknown>;
	go(target: string, patch?: Record<string, unknown>): void;
	back(): void;
	copy(text: string): Promise<void>;
}

export declare const ui: SpoolUi;
export declare function bootPlayer(frames: Record<string, ComponentType>): void;
