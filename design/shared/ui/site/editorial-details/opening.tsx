import { useEffect, useRef, useState } from "react";
import { SpoolMark } from "shared/ui/site/current/ui/spool/mark";
import { OffprintSurface } from "shared/ui/site/current/ui/site/demo-apps/landing-canvas";
import { DOWNLOAD, INSTALL_COMMAND } from "shared/ui/site/current/install";

export type DetailTake = "quiet" | "fine" | "long" | "circle" | "tray" | "red" | "small" | "inline" | "aside" | "warm" | "strip" | "margin";
type IconKind = "down" | "out" | "copy" | "tray";

function Icon({ kind }: { kind: IconKind }) {
 const paths: Record<IconKind, string> = {
  down: "M12 4v16m-6-6 6 6 6-6",
  out: "M5 19 19 5M5 5h14v14",
  copy: "M9 9h11v11H9zM15 5V3H3v12h2",
  tray: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
 };
 return <svg className="ef-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

function Command({ icons }: { icons: boolean }) {
 const [status, setStatus] = useState("");
 const code = useRef<HTMLElement>(null);
 const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
 useEffect(() => () => { if (reset.current !== null) clearTimeout(reset.current); }, []);
 async function copy() {
  if (reset.current !== null) clearTimeout(reset.current);
  try {
   await navigator.clipboard.writeText(INSTALL_COMMAND);
   setStatus("Copied");
   reset.current = setTimeout(() => setStatus(""), 2500);
  } catch {
   const selection = window.getSelection();
   if (code.current && selection) {
    const range = document.createRange();
    range.selectNodeContents(code.current);
    selection.removeAllRanges();
    selection.addRange(range);
   }
   setStatus("Select and copy");
  }
 }
 return <button className="ef-command" type="button" aria-label={`Copy command: ${INSTALL_COMMAND}`} onClick={() => void copy()}><code ref={code}>{INSTALL_COMMAND}</code><span aria-live="polite">{status || (icons ? <Icon kind="copy" /> : "Copy")}</span></button>;
}

const invitations: Record<DetailTake, string> = {
 quiet: "Try it for yourself.", fine: "Try it for yourself.", long: "Try it for yourself.", circle: "Try it for yourself.", tray: "Try it for yourself.", red: "Try it for yourself.",
 small: "A little room to try things.", inline: "Take it for a spin.", aside: "Go on.\nPress something.", warm: "Something to work with.", strip: "This canvas is yours to try.", margin: "Try an idea on for size.",
};

export function EditorialOpening({ take }: { take: DetailTake }) {
 const button = take === "tray" || take === "inline";
 const icons = button || ["fine", "long", "circle"].includes(take);
 const downloadIcon = button ? "tray" : "down";
 return <>
  <header className="ef-nav sg-width">
   <a href="#" aria-label="spool home" className="sg-brand"><SpoolMark /><span>spool</span></a>
   <nav aria-label="Website navigation"><a href="https://github.com/liamvinberg/spool#readme">Docs{take === "fine" && <Icon kind="out" />}</a><a href="https://github.com/liamvinberg/spool">GitHub{take === "fine" && <Icon kind="out" />}</a><a className="ef-nav-get" href="#start">Get spool</a></nav>
  </header>
  <section className="ef-hero sg-width">
   <h1>A canvas for<br />working things out.</h1>
   <div className="ef-bottom">
    <p>Design websites, apps, and presentations with your agent. Try them live. Keep what works.</p>
    <div className="ef-acquire">
     <a className="ef-download" href={DOWNLOAD}>{button && <Icon kind={downloadIcon} />}<span>Download for Mac</span>{icons && !button && <span className="ef-download-symbol"><Icon kind={downloadIcon} /></span>}</a>
     <Command icons={icons} />
    </div>
   </div>
  </section>
  <section className="ef-preview sg-width" aria-label="Offprint on the spool canvas">
   <div className="ef-invitation">
    <h2>{invitations[take]}</h2>
    <p>{take === "small" || take === "inline" || take === "strip" ? "Open a frame. Try the flow." : "Offprint is a workshop app made in spool. Open a frame and have a look around."}</p>
    {(take === "long" || take === "circle" || take === "fine") && <a className="ef-demo-link" href="#ef-canvas" aria-label="Explore the canvas"><Icon kind="down" /></a>}
   </div>
   <div id="ef-canvas" className="ef-canvas"><OffprintSurface view="canvas" /></div>
   <div className="sg-caption"><p>Offprint, on the canvas.</p><span>Interactive preview · changes stay here</span></div>
  </section>
 </>;
}
