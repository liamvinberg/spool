import { PhoneReach } from "shared/ui/explore/cloud/canvas/reach";

// the coffee screens it draws never walk; this frame has no destinations
export const links = {} as const;

export default function Frame() {
	return <PhoneReach state="base" device />;
}
