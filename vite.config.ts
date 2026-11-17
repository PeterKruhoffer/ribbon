import stylex from "@stylexjs/unplugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite-plus";

// StyleX appends its rules to styles.css and re-emits it under a new hash. It
// rewrites the chunks' code and importedCss, but not importedAssets, where the
// `styles.css?url` import lives. Alchemy copies importedAssets to the client
// output, so point stale entries at the renamed file.
const stylexAssetNames: Plugin = {
  name: "ribbon:stylex-asset-names",
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      const assets = chunk.type === "chunk" ? chunk.viteMetadata?.importedAssets : undefined;
      if (!assets || chunk.type !== "chunk") continue;
      for (const stale of [...assets].filter((name) => !(name in bundle))) {
        const prefix = stale.replace(/-[\w-]+\.css$/, "-");
        const renamed = Object.keys(bundle).find(
          (name) => name.startsWith(prefix) && name.endsWith(".css") && chunk.code.includes(name),
        );
        assets.delete(stale);
        if (renamed) assets.add(renamed);
      }
    }
  },
};

export default defineConfig({
  plugins: [stylex.vite(), stylexAssetNames, tanstackStart(), viteReact()],
  lint: {
    ignorePatterns: ["src/routeTree.gen.ts"],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: ["src/routeTree.gen.ts"],
    semi: true,
    singleQuote: false,
  },
});
