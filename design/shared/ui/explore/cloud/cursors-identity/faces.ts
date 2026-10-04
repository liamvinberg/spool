import amir from "./faces/amir.jpg";
import elin from "./faces/elin.jpg";
import ingrid from "./faces/ingrid.jpg";
import jonas from "./faces/jonas.jpg";
import liam from "./faces/liam.jpg";
import maja from "./faces/maja.jpg";
import oskar from "./faces/oskar.jpg";
import sara from "./faces/sara.jpg";
import type { PersonId } from "./script";

/** the team's account photos, as the cloud would hand them over */
export const FACES: Readonly<Record<PersonId, string>> = { amir, elin, ingrid, jonas, liam, maja, oskar, sara };
