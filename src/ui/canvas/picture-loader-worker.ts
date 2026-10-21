import { type LoaderPort, serveLoader } from "./picture-loader";

/** A picture loader in a worker of its own (`picture-loader.ts`), the way the layer runs them wherever it can. */
serveLoader(self as unknown as LoaderPort);
