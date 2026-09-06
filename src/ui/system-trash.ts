import { currentPlatform } from "../runtime/platform-keys";

export function systemTrashName(): string {
	return /^win/i.test(currentPlatform()) ? "Recycle Bin" : "Trash";
}
