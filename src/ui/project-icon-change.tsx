import { useEffect, useRef, useState } from "react";
import { changeProjectIcon, type ProjectIcon, removeProjectIcon } from "./api";
import { type Notice, Toast } from "./canvas/toast";

/** The images an icon may be; the daemon reads the kind from the bytes and refuses anything else. */
const ICON_ACCEPT = "image/svg+xml,image/png,image/webp,image/jpeg";

/**
 * "Change icon…" and "Remove icon", wherever a project offers them: on its tab's menu and its cover's.
 *
 * Change opens the system's file chooser for images (the Mac app shows its own open panel), and the chosen file
 * goes to the daemon, which writes it as the project's `design/shared/icon.<ext>`. `onIcon` takes what the project
 * wears after either, so the tab and Home change at once; the app event the daemon sends says the same thing to
 * every other page. A refusal is said the way the app says a failed export.
 */
export function useIconChange(onIcon: (root: string, icon: ProjectIcon | undefined) => void) {
	const input = useRef<HTMLInputElement>(null);
	const target = useRef<{ root: string; name: string } | null>(null);
	const [notice, setNotice] = useState<Notice | null>(null);
	useEffect(() => {
		if (!notice) return;
		const timer = setTimeout(() => setNotice(null), 5000);
		return () => clearTimeout(timer);
	}, [notice]);
	const said = (error: unknown, fallback: string) =>
		setNotice({ kind: "error", message: error instanceof Error && error.message ? error.message : fallback });
	return {
		change: (project: { root: string; name: string }) => {
			target.current = project;
			input.current?.click();
		},
		remove: (project: { root: string; name: string }) => {
			void removeProjectIcon(project.root).then(
				(icon) => onIcon(project.root, icon),
				(error: unknown) => said(error, "Could not remove the icon. Try again."),
			);
		},
		surface: (
			<>
				<input
					ref={input}
					type="file"
					accept={ICON_ACCEPT}
					hidden
					aria-label="Choose an icon"
					onChange={(event) => {
						const file = event.currentTarget.files?.[0];
						const project = target.current;
						event.currentTarget.value = "";
						if (file === undefined || project === null) return;
						void changeProjectIcon(project.root, file).then(
							(icon) => onIcon(project.root, icon),
							(error: unknown) => said(error, "Could not change the icon. Try again."),
						);
					}}
				/>
				{notice && <Toast notice={notice} />}
			</>
		),
	};
}
