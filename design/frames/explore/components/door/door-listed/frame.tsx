import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * The `library` row listed with the pages, last, wearing the projected face
 * and nothing else ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * The smallest diff: one more row, sorted after the folders because it is not
 * one. The case against is that nothing says so; a face that differs from a
 * folder icon by two rectangles is the only tell.
 */
export default function DoorListedFrame() {
	return <DoorCanvas where="listed" start="library" />;
}
