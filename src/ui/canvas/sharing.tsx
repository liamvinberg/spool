import { useEffect, useMemo } from "react";
import { usePlayerShare } from "../../runtime/player-share";
import { canvasPublicationClient } from "../api";
import { attachHotkeyLayer } from "../hotkey-dispatch";

export function CanvasSharing({
	project,
	entry,
	request,
	onStatus,
}: {
	project: string;
	entry: string;
	request: number;
	onStatus: (status: string | undefined) => void;
}) {
	const client = useMemo(() => canvasPublicationClient(project, entry), [project, entry]);
	const share = usePlayerShare(client);
	useEffect(() => {
		if (!share.open) return;
		return attachHotkeyLayer({ scope: "dialog", handlers: {} });
	}, [share.open]);
	useEffect(() => {
		if (request > 0) share.show();
	}, [request, share.show]);
	useEffect(() => {
		onStatus(share.status);
	}, [share.status, onStatus]);
	return (
		<>
			{share.surface}
			{share.tray}
		</>
	);
}
