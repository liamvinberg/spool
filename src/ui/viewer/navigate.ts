import { createContext } from "react";

/**
 * How the browser app goes to another of its places, an address on this origin: in place through History where the
 * app holds both Home and the canvas, else a full page load, as on a link share's own host.
 */
export const NavigateContext = createContext<(href: string) => void>((href) => window.location.assign(href));
