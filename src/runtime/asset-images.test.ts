// @vitest-environment happy-dom
// @vitest-environment-options { "url": "https://frames.localhost/p/demo/frames/home" }

import { expect, it } from "vitest";
import { loadAssetImagesUnderCors } from "./asset-images";

const ASSET = `/asset/${"c".repeat(64)}.png`;

loadAssetImagesUnderCors();

it("loads an image under CORS when an attribute or a picture's source names an asset, and leaves others plain", () => {
	const named = document.createElement("img");
	named.setAttribute("SRC", ASSET);
	expect(named.crossOrigin).toBe("anonymous");

	const elsewhere = document.createElement("img");
	elsewhere.setAttribute("src", "https://example.com/a.png");
	expect(elsewhere.getAttribute("crossorigin")).toBeNull();

	// the author's own mode stands
	const chosen = document.createElement("img");
	chosen.setAttribute("crossorigin", "use-credentials");
	chosen.setAttribute("src", ASSET);
	expect(chosen.crossOrigin).toBe("use-credentials");

	// a picture is built as React builds one, source first, then the img that falls back to a plain file
	const picture = document.createElement("picture");
	const source = document.createElement("source");
	source.setAttribute("srcset", `${ASSET} 2x`);
	picture.appendChild(source);
	const fallback = document.createElement("img");
	fallback.setAttribute("src", "/fallback.png");
	picture.appendChild(fallback);
	expect(fallback.crossOrigin).toBe("anonymous");

	// and a source arriving after its img still reaches it
	const later = document.createElement("picture");
	const img = document.createElement("img");
	later.appendChild(img);
	const arriving = document.createElement("source");
	arriving.setAttribute("srcset", ASSET);
	later.insertBefore(arriving, img);
	expect(img.crossOrigin).toBe("anonymous");
});
