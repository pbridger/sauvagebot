import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Put the dice renderer's textures where it will look for them.
 *
 * The library fetches them at runtime from its configured `assetPath`, so they have
 * to be real files under the site root — 1.6MB of webp that belongs to a dependency
 * and therefore should not live in the repository. Copying into `public/dice` covers
 * both cases in one go: `vite dev` serves `public/` as-is, and a build copies it to
 * the output. `public/dice` is gitignored.
 *
 * Sounds are not copied. They are off by default (four clatter tracks over Discord
 * voice is not a feature) and are another 672kB; switching them on means adding
 * `sounds` to this list.
 */
function diceAssets(): Plugin {
  return {
    name: 'savagebot-dice-assets',
    buildStart() {
      const from = resolve(__dirname, '../node_modules/@drdreo/dice-box-threejs/dist/textures');
      const to = resolve(__dirname, 'public/dice/textures');
      if (!existsSync(from)) {
        // A fresh clone without `npm install` yet: the build will fail for better
        // reasons than a missing texture.
        this.warn('dice textures not found in node_modules; skipping copy');
        return;
      }
      cpSync(from, to, { recursive: true });
    },
  };
}

/**
 * Where this build will be served from.
 *
 * GitHub Pages puts a project site under `/<repo>/`, not at a domain root, so
 * every path in the manifest has to carry that prefix — OBR fetches the manifest
 * and then loads `popover` and `icon` from it. Default `/` keeps `vite dev` and a
 * root-served deploy working unchanged.
 */
const base = process.env.VITE_BASE ?? '/';

/**
 * Rewrite the manifests' absolute paths to sit under `base`.
 *
 * The manifests are static files so Vite copies them verbatim; this fixes them up
 * afterwards rather than keeping two hand-maintained copies that would drift.
 */
function manifestBase(): Plugin {
  return {
    name: 'savagebot-manifest-base',
    apply: 'build',
    closeBundle() {
      if (base === '/') return;
      const prefix = base.replace(/\/$/, '');
      const out = resolve(__dirname, '../dist-extension');
      for (const name of ['manifest.json', 'probe-manifest.json']) {
        const file = resolve(out, name);
        const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> & {
          icon?: string;
          action?: { icon?: string; popover?: string };
        };
        const fix = (path: string | undefined): string | undefined =>
          path?.startsWith('/') ? `${prefix}${path}` : path;
        for (const target of [manifest, manifest.action] as ({ icon?: string; popover?: string } | undefined)[]) {
          if (!target) continue;
          const icon = fix(target.icon);
          if (icon !== undefined) target.icon = icon;
          const popover = fix(target.popover);
          if (popover !== undefined) target.popover = popover;
        }
        writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
      }
    },
  };
}

// The probe (and later the real extension) is served from this directory.
// OBR loads it by URL, so during development it must be reachable over the
// network as well as from this machine: `host: true` binds all interfaces.
export default defineConfig({
  root: __dirname,
  base,
  plugins: [diceAssets(), manifestBase()],
  server: {
    host: true,
    port: 5173,
    cors: true,
  },
  build: {
    outDir: '../dist-extension',
    emptyOutDir: true,
    rollupOptions: {
      // Three pages: the extension proper, the dice overlay it opens as a
      // full-screen modal, and the scratch harness kept from milestone 0. The
      // overlay is a separate entry so the renderer and its textures are a chunk
      // nobody loads unless dice are actually being animated.
      input: {
        main: resolve(__dirname, 'index.html'),
        dice: resolve(__dirname, 'dice.html'),
        spike: resolve(__dirname, 'dice-spike.html'),
        probe: resolve(__dirname, 'probe.html'),
      },
    },
  },
});
