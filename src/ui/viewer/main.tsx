import { createRoot } from "react-dom/client";
import "./viewer.css";
import { readConfig } from "./source";
import { Viewer } from "./viewer";

const root = document.getElementById("root");
if (root === null) throw new Error("spool viewer: no #root element");
createRoot(root).render(<Viewer config={readConfig()} />);
