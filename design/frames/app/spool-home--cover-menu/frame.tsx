import { SpoolHomeScreen } from "shared/ui/spool/home-screen";

/**
 * A cover's menu on Home. Each cover leads its name with the project's icon, the file in design/shared or the
 * repo's favicon, else the name's letter on a tint; the menu has "Change icon…" after Open, and "Remove icon"
 * while the icon is the file.
 */
export default function Frame() {
	return <SpoolHomeScreen menuAt="~/spool/kaffe" />;
}
