import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./ui.css";

const root = document.getElementById("root");
if (root === null) throw new Error("spool ui: no #root element");
createRoot(root).render(<App />);
