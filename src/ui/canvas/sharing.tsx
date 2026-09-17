import { useEffect, useMemo, useState } from "react";
import { usePlayerShare } from "../../runtime/player-share";
import { canvasPublicationClient, fetchSharingAvailable } from "../api";
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

export function useSharingAvailable(): boolean {
	const [available, setAvailable] = useState(false);
	useEffect(() => {
		let revision = 0;
		const refresh = () => {
			const request = ++revision;
			void fetchSharingAvailable().then((next) => {
				if (request === revision) setAvailable(next);
			});
		};
		const foreground = () => {
			if (document.visibilityState === "visible") refresh();
		};
		refresh();
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", foreground);
		return () => {
			revision++;
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", foreground);
		};
	}, []);
	return available;
}
