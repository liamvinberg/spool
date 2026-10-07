import { SOURCES } from "shared/lib/explore/tab-place/tabs";
import { IconSources } from "shared/ui/explore/tab-place/icon-sources";

/** No icon file: the repo's favicon, and with no favicon either, the name's letter on a tint. */
export default function IconFallbackFrame() {
	return (
		<IconSources
			take="badge"
			rows={[
				{
					tab: SOURCES.file,
					from: "design/shared/icon.svg",
					says: "The picked icon. It is a file in design/, so git tracks it, and a team project sends it to the team with the frames.",
				},
				{
					tab: SOURCES.favicon,
					from: "public/favicon.svg",
					says: "No icon file, so spool uses the repo's favicon. It sits outside design/, so on a team project a teammate who opened it from spool.page sees the letter instead.",
				},
				{
					tab: SOURCES.letter,
					from: "no icon",
					says: "Neither. The first letter, lowercase, on a tint picked from the name, so it never looks like a team's solid capital.",
				},
			]}
			frame="icon-fallback"
			argues="First found wins: design/shared/icon.*, then the repo's favicon, then the letter. A tab never shows an empty slot."
		/>
	);
}
