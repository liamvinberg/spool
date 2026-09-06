import { SPOOL_FAVICON_SVG } from "../brand";

/** The callback acknowledges a code, before the SDK exchanges and saves credentials. */
export function bundledOAuthPage(outcome: "received" | "error", font: string): string {
	const title = outcome === "received" ? "Return to Spool" : "Connection not completed";
	const message =
		outcome === "received"
			? "Continue in Spool to finish connecting your account. You can close this window."
			: "Return to Spool to try again. You can close this window.";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'">
<title>${title} · Spool</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(SPOOL_FAVICON_SVG)}">
<style>
@font-face { font-family: "Instrument Sans Variable"; font-style: normal; font-weight: 400 700; font-display: swap; src: url("${font}") format("woff2"); }
* { box-sizing: border-box; }
html { color-scheme: dark; }
body { margin: 0; min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: 24px; background: #0e0e0e; color: #f0efed; font-family: "Instrument Sans Variable", system-ui, sans-serif; }
main { width: 380px; max-width: 100%; overflow: hidden; border: 1px solid #363636; border-radius: 12px; background: #282828; }
header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid #363636; }
.mark { display: block; width: 16px; height: 20px; flex: none; }
.mark svg { display: block; width: 100%; height: 100%; }
h1 { margin: 0; font-size: 14px; font-weight: 500; line-height: 22px; }
p { margin: 0; padding: 16px 20px; font-size: 13px; font-weight: 400; line-height: 20px; color: #94918d; }
</style>
</head>
<body>
<main data-spool-oauth="${outcome}">
<header><span class="mark" aria-hidden="true">${SPOOL_FAVICON_SVG}</span><h1>${title}</h1></header>
<p>${message}</p>
</main>
</body>
</html>`;
}
