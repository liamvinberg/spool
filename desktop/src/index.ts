import { boot } from "./main";

// The entry electron-builder points the bundle at. It exists so that main.ts is
// a module a test can import without a window opening behind it.
boot();
