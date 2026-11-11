// Spool Beta (spool#282): main, built by .github/workflows/beta.yml and installed
// beside Spool. scripts/build.sh picks this file for a version with `-beta.N`.
// It is electron-builder.yml with the beta's own say, written as code rather
// than as a yml that extends it, because electron-builder adds a child's list to
// its parent's and refuses null: a yml could not take Spool's .spool claim away.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
// electron-builder's own yaml reader, so the beta reads Spool's config exactly as a release build does
const builder = createRequire(createRequire(import.meta.url).resolve("app-builder-lib"));
const { load } = builder("js-yaml") as { load: (text: string) => Record<string, unknown> };

const spool = load(readFileSync(`${here}electron-builder.yml`, "utf8"));
const mac = spool.mac as Record<string, unknown>;
// Spool keeps .spool files: the beta never claims them over it.
const { fileAssociations: _spools, ...beta } = mac;

export default {
	...spool,
	// Its own app: its own bundle, Dock icon, userData and single-instance lock.
	appId: "page.spool.mac.beta",
	productName: "Spool Beta",
	// electron-updater keeps its downloads in ~/Library/Caches/<name>-updater,
	// named after the package: the beta's own, or the two apps would share one.
	extraMetadata: { name: "spool-desktop-beta" },
	// Its own feed, under beta/ in the same bucket. electron-builder would read
	// `beta` off the version and bake that channel in, sending the updater to
	// beta-mac.yml; the feed beside the beta's zip is latest-mac.yml, as Spool's is.
	detectUpdateChannel: false,
	publish: { provider: "generic", url: "https://updates.spool.page/beta" },
	mac: { ...beta, icon: "assets/iconBeta.icns" },
};
