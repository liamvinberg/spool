// the web APIs spool's runtime and frames reach for that Blitz's Boa runtime lacks, stubbed
for (const n of ["HTMLCanvasElement","HTMLVideoElement","HTMLImageElement","SVGElement","HTMLIFrameElement"]) if (typeof globalThis[n] === "undefined") globalThis[n] = function(){};
if (typeof globalThis.IntersectionObserver === "undefined") globalThis.IntersectionObserver = class { constructor(cb){this.cb=cb} observe(){} unobserve(){} disconnect(){} takeRecords(){return []} };
if (typeof globalThis.ResizeObserver === "undefined") globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
if (typeof globalThis.MutationObserver === "undefined") globalThis.MutationObserver = class { observe(){} disconnect(){} takeRecords(){return []} };
if (typeof globalThis.matchMedia === "undefined") globalThis.matchMedia = (q) => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
if (typeof globalThis.MessageChannel === "undefined") globalThis.MessageChannel = class { constructor(){ const a={onmessage:null,postMessage:(d)=>setTimeout(()=>b.onmessage&&b.onmessage({data:d}),0)}; const b={onmessage:null,postMessage:(d)=>setTimeout(()=>a.onmessage&&a.onmessage({data:d}),0)}; this.port1=a; this.port2=b; } };
if (typeof globalThis.crypto === "undefined") globalThis.crypto = { getRandomValues(a){ for (let i=0;i<a.length;i++) a[i]=Math.floor(Math.random()*4294967296); return a; }, randomUUID(){ return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,()=>Math.floor(Math.random()*16).toString(16)); } };
if (typeof window !== "undefined" && typeof window.crypto === "undefined") window.crypto = globalThis.crypto;
if (typeof globalThis.performance === "undefined") { const t0 = Date.now(); globalThis.performance = { now: () => Date.now() - t0, timeOrigin: t0, mark(){}, measure(){}, getEntriesByName(){return []} }; }
;(function(){var log=[];function put(m){try{log.push(String(m).slice(0,300));document.documentElement.setAttribute("data-s219err",log.join(" | "))}catch(e){}}
window.addEventListener&&window.addEventListener("error",function(e){put("error: "+(e.message||e.error))});
window.addEventListener&&window.addEventListener("unhandledrejection",function(e){put("rejection: "+(e.reason&&(e.reason.stack||e.reason.message)||e.reason))});
var ce=console.error;console.error=function(){put("console.error: "+Array.prototype.join.call(arguments," "));ce&&ce.apply(console,arguments)};window.__s219put=put;})();
;if(typeof Image==="undefined"){window.Image=function(w,h){var i=document.createElement("img");if(w)i.setAttribute("width",w);if(h)i.setAttribute("height",h);return i}}
