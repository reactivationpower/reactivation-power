import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import esbuildPluginPino from "esbuild-plugin-pino";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require ??= createRequire(import.meta.url);

/**
 * Shared esbuild settings for the server bundle. `build.mjs` uses them for the
 * real build; the bundling tests reuse them so what they verify is what ships.
 */

// Some packages may not be bundleable, so we externalize them, we can add more here as needed.
// Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
// Examples of unbundleable packages:
// - uses native modules and loads them dynamically (e.g. sharp)
// - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
//
// pdfkit is deliberately NOT external: bundling it (with the plugin below)
// puts its standard font data inside the output, so the Vercel function does
// not depend on files from node_modules that the deployment may not include.
export const externals = [
  "*.node",
  "sharp",
  "better-sqlite3",
  "sqlite3",
  "canvas",
  "bcrypt",
  "argon2",
  "fsevents",
  "re2",
  "farmhash",
  "xxhash-addon",
  "bufferutil",
  "utf-8-validate",
  "ssh2",
  "cpu-features",
  "dtrace-provider",
  "isolated-vm",
  "lightningcss",
  "pg-native",
  "oracledb",
  "mongodb-client-encryption",
  "nodemailer",
  "handlebars",
  "knex",
  "typeorm",
  "protobufjs",
  "onnxruntime-node",
  "@tensorflow/*",
  "@prisma/client",
  "@mikro-orm/*",
  "@grpc/*",
  // Only the native compiler is external; fontkit (via pdfkit) imports the
  // plain-JS @swc/helpers, which must be bundled or the bundle cannot resolve it.
  "@swc/core",
  "@aws-sdk/*",
  "@azure/*",
  "@opentelemetry/*",
  "@google-cloud/*",
  "@google/*",
  "googleapis",
  "firebase-admin",
  "@parcel/watcher",
  "@sentry/profiling-node",
  "@tree-sitter/*",
  "aws-sdk",
  "classic-level",
  "dd-trace",
  "ffi-napi",
  "grpc",
  "hiredis",
  "kerberos",
  "leveldown",
  "miniflare",
  "mysql2",
  "newrelic",
  "odbc",
  "piscina",
  "realm",
  "ref-napi",
  "rocksdb",
  "sass-embedded",
  "sequelize",
  "serialport",
  "snappy",
  "tinypool",
  "usb",
  "workerd",
  "wrangler",
  "zeromq",
  "zeromq-prebuilt",
  "playwright",
  "puppeteer",
  "puppeteer-core",
  "electron",
];

/**
 * pdfkit's Node build loads its 14 standard fonts lazily through
 * `createRequire(import.meta.url)('#standard-fonts/<Name>')`. esbuild leaves
 * that private subpath import untouched, so at run time the bundle would look
 * for `#standard-fonts/*` relative to itself and fail ("Cannot find module").
 * Rewrite each loader to the package's public `pdfkit/standard-fonts/<Name>`
 * export so esbuild inlines the font metrics into the bundle. The build fails
 * loudly if a pdfkit upgrade changes this pattern.
 */
export const pdfkitStandardFontsPlugin = {
  name: "pdfkit-standard-fonts",
  setup(build) {
    build.onLoad({ filter: /[\\/]pdfkit[\\/]js[\\/]pdfkit\.node\.mjs$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      const contents = source.replaceAll("require$1('#standard-fonts/", "require('pdfkit/standard-fonts/");
      if (contents === source) {
        throw new Error(`pdfkit standard-font loaders not found in ${args.path}; update esbuild.config.mjs for this pdfkit version`);
      }
      return { contents, loader: "js", resolveDir: path.dirname(args.path) };
    });
  },
};

// Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
export const banner = {
  js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
};

/** Options shared by every server bundle (entry points and outdir are per call). */
export function bundleOptions() {
  return {
    platform: "node",
    bundle: true,
    format: "esm",
    outExtension: { ".js": ".mjs" },
    external: externals,
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] }),
      pdfkitStandardFontsPlugin,
    ],
    banner,
  };
}
