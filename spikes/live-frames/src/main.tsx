// No StrictMode on purpose: dev double-mounting reloads every iframe twice,
// which doubles the hydrate storm and poisons every measurement this rig exists to take.

import { createRoot } from "react-dom/client";
import { Canvas } from "./canvas";
import { VARIANT } from "./docs";
import "./index.css";

if (VARIANT === "react") document.title = `${document.title} · react frames`;

const root = document.getElementById("root");
if (!root) throw new Error("no #root");

createRoot(root).render(<Canvas />);
