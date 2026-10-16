import type { BuildOptions, Plugin } from "esbuild";

export const externals: string[];
export const pdfkitStandardFontsPlugin: Plugin;
export const banner: { js: string };
export function bundleOptions(): BuildOptions;
