import stylex from "@stylexjs/unplugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [stylex.vite(), tanstackStart(), viteReact()],
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
