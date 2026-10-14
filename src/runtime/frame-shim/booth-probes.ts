/**
 * What the photo booth runs in its isolated world of a frame's tab
 * (`daemon/booth.ts`): the same settle and content height the shim runs inside
 * the frame, built to one expression (src/frame-shim-build.ts).
 */
export { contentHeight } from "./content-height";
export { settle } from "./settle";
