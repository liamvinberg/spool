import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * The `library` row pinned above the pages with a hairline under it
 * ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * The line says everything under it is a folder you can add a frame to and
 * this is not, which is the sheet take's argument kept. The cost is that the
 * row is the first thing in the rail on every project, and the pages, which
 * are the work, start one row lower for it.
 */
export default function DoorHeadFrame() {
	return <DoorCanvas where="head" start="library" />;
}
