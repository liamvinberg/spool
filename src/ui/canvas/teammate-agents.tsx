import { useSyncExternalStore } from "react";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import type { CameraStore } from "./camera-store";
import { PlaceholderFrame } from "./placeholder-frame";
import type { PresenceRoom } from "./presence";

/**
 * Teammates' agents on a team canvas (#378).
 *
 * A placeholder frame a teammate's designer holds reaches this canvas through sync like any
 * frame file, with a record of whose agent made it. It is drawn in that person's presence
 * colour, as this canvas last heard of them, and in neutral ink for someone it has not.
 */

/** whose a placeholder is, when it is a teammate's: made by an account other than this canvas's own */
export function teammateOf(
	placeholder: ProjectedPlaceholder,
	you: string | null,
): { accountId: string; name: string } | undefined {
	const by = placeholder.by;
	if (by === undefined || you === null || by.accountId === you) return undefined;
	return by;
}

/** a teammate's presence colour, as this canvas last heard it; null for someone it never has */
function useColor(room: PresenceRoom, accountId: string): string | null {
	return useSyncExternalStore(room.subscribe, () => room.person(accountId)?.color ?? null);
}

export function TeammatePlaceholder({
	room,
	placeholder,
	by,
	camera,
	pointed,
}: {
	room: PresenceRoom;
	placeholder: ProjectedPlaceholder;
	by: { accountId: string; name: string };
	camera: CameraStore;
	pointed: boolean;
}) {
	const color = useColor(room, by.accountId);
	const name = room.person(by.accountId)?.name ?? by.name;
	return (
		<PlaceholderFrame
			placeholder={placeholder}
			camera={camera}
			work={null}
			pointed={pointed}
			owner={{ accountId: by.accountId, name, color }}
		/>
	);
}
