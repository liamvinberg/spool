import type { ReactNode, RefObject } from "react";
import type { Camera } from "../api";
import type { DeckStore } from "./agent-deck";
import { useAgentTrail } from "./agent-trail";
import type { CameraStore } from "./camera-store";
import type { CanvasStore } from "./canvas-store";
import { CornerRow } from "./corner-row";
import type { PresenceRoom } from "./presence";
import { facesOf, PresenceFaces, useRoomDrawn } from "./presence-faces";

/**
 * What the canvas holds at its top right (spool#312): the agent's path, who's here on a team canvas and, on a deck
 * page, Present in the corner, as one row (`corner-row.tsx`), with what agents in a terminal are doing hung under it.
 * The faces stand here before the project has loaded and while it is empty too.
 */
export function CanvasCorner({
	loaded,
	deck,
	store,
	camera,
	viewportRef,
	page,
	project,
	team,
	room,
	following,
	under,
	onFollowMate,
	toPage,
	onLand,
	present,
	children,
}: {
	/** the project has loaded: the agent's path waits for it */
	loaded: boolean;
	deck: DeckStore;
	store: CanvasStore;
	camera: CameraStore;
	viewportRef: RefObject<HTMLDivElement | null>;
	/** the page the canvas shows */
	page: string;
	/** what the root page is called */
	project: string;
	/** a team canvas, whose teammates have faces */
	team: boolean;
	room: PresenceRoom;
	/** the teammate followed, by account */
	following: string | null;
	/** `following <name> · esc` hangs from the top right, and the row stands under it */
	under: boolean;
	onFollowMate: (accountId: string | null) => void;
	toPage: (page: string, arrive: Camera | undefined, then: Camera) => void;
	onLand: (name: string) => void;
	/** Present with its caret, on a deck page with slides */
	present?: ReactNode;
	/** what hangs under the row: agents working here from a terminal */
	children?: ReactNode;
}) {
	useRoomDrawn(room);
	const trail = useAgentTrail({
		deck,
		store,
		camera,
		viewportRef,
		page,
		project,
		teammate: following !== null,
		onFollow: () => onFollowMate(null),
		toPage,
		onLand,
	});
	const anyone = team && facesOf(room, page, Date.now()).faces.length > 0;
	return (
		<CornerRow
			viewport={viewportRef}
			under={under}
			trail={loaded ? trail : null}
			faces={
				anyone
					? (max) => (
							<PresenceFaces
								room={room}
								page={page}
								project={project}
								following={following}
								onFollow={onFollowMate}
								max={max}
								align="end"
							/>
						)
					: null
			}
			present={present}
		>
			{children}
		</CornerRow>
	);
}
