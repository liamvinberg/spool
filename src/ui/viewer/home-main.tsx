import { createRoot } from "react-dom/client";
import "./viewer.css";
import { BrowserHome, readHomeConfig } from "./team-home";

const root = document.getElementById("root");
if (root === null) throw new Error("spool home: no #root element");
createRoot(root).render(<BrowserHome config={readHomeConfig()} />);
