import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["index.ts"],
	format: ["cjs", "esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	external: ["react", "convex"],
});
