import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * The `library` row docked against the bottom of the rail, ruled off from the
 * pages above it ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * The pages read top down and stay where they are; the library is where the rail
 * ends, one row, always in the same place however long the list above it grows.
 * Present only when `shared/ui/` exports at least one component, so a project
 * with no shared code has no empty library row.
 */
export default function DoorFootFrame() {
	return <DoorCanvas where="foot" start="library" />;
}
