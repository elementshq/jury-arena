import type { NextConfig } from "next";
import * as path from "node:path";

/**
 * MODE=app  → DB-backed usecase modules (default)
 * MODE=demo → static JSON data layer (no DB required)
 *
 * In demo mode, each usecase module is aliased to lib/static-data.ts
 * so that page/layout imports remain unchanged.
 */
const isDemo = process.env.MODE === "demo";
const isDemoExport = isDemo && process.env.DEMO_EXPORT === "1";

// Usecase module paths that have static-data equivalents.
// In demo mode, these all redirect to @/lib/static-data which exports
// the same function names backed by JSON files instead of DB.
const demoAliasedUsecases = [
	"@/lib/usecase/projects/get-project",
	"@/lib/usecase/projects/get-projects",
	"@/lib/usecase/projects/get-project-datasets",
	"@/lib/usecase/projects/get-project-datasets-count",
	"@/lib/usecase/projects/get-recent-evaluated-datasets",
	"@/lib/usecase/projects/get-project-evaluations",
	"@/lib/usecase/projects/get-project-samples",
	"@/lib/usecase/projects/resolve-project-context",
	"@/lib/usecase/evaluations/get-dataset",
	"@/lib/usecase/datasets/get-dataset-detail",
	"@/lib/usecase/benchmarks/get-benchmark-detail",
	"@/lib/usecase/matches/get-matches",
	"@/lib/usecase/matches/get-match-detail",
	"@/lib/setup/requirements",
	"@/lib/config/dataset-capabilities",
];

// Turbopack requires @/-prefixed paths; webpack needs absolute paths.
const turbopackAliases: Record<string, string> = {};
const webpackAliases: Record<string, string> = {};

if (isDemo) {
	const staticDataAbs = path.resolve(__dirname, "lib/static-data");
	for (const mod of demoAliasedUsecases) {
		turbopackAliases[mod] = "@/lib/static-data";
		// Webpack: alias both the @/ form and the resolved absolute form
		webpackAliases[mod] = staticDataAbs;
		const rel = mod.replace("@/", "");
		webpackAliases[path.resolve(__dirname, rel)] = staticDataAbs;
	}
}

const nextConfig: NextConfig = {
	reactCompiler: true,

	// Expose demo flag to client components via NEXT_PUBLIC_
	env: {
		NEXT_PUBLIC_DEMO: isDemo ? "1" : "",
		NEXT_PUBLIC_BASE_PATH: isDemoExport ? "/ele-cloud-autobench/demo" : "",
	},

	// Static export for GitHub Pages deployment (DEMO_EXPORT=1)
	...(isDemoExport && {
		output: "export" as const,
		basePath: "/ele-cloud-autobench/demo",
		images: { unoptimized: true },
	}),

	turbopack: isDemo ? { resolveAlias: turbopackAliases } : {},

	webpack: isDemo
		? (config) => {
				config.resolve = config.resolve || {};
				config.resolve.alias = config.resolve.alias || {};
				Object.assign(config.resolve.alias, webpackAliases);
				return config;
			}
		: undefined,
};

export default nextConfig;
