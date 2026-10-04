import { PhoneCanvas } from "shared/ui/explore/cloud/canvas/phone";

// the coffee screens it draws never walk; this frame has no destinations
export const links = {} as const;

export default function Frame() {
	return <PhoneCanvas take="deck" state="base" device />;
}
