import { createRoot } from "react-dom/client";
import "./viewer.css";
import { SpoolApp } from "./app";
import { readConfig } from "./source";
import { readHomeConfig } from "./team-home";

/** What the page says: who is signed in, for Home, and on a canvas's address where its project is read. */
const optional = <T,>(read: () => T): T | null => {
	try {
		return read();
	} catch {
		return null;
	}
};

const root = document.getElementById("root");
if (root === null) throw new Error("spool: no #root element");
createRoot(root).render(<SpoolApp home={optional(readHomeConfig)} viewer={optional(readConfig)} />);
