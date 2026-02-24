import "server-only";

import fs from "node:fs";
import path from "node:path";

export const SetupIssueId = {
  DatabaseUrl: "DATABASE_URL",
  ModelsYaml: "MODELS_YAML",
} as const;

export type SetupIssueId =
  (typeof SetupIssueId)[keyof typeof SetupIssueId];

export type SetupIssue = {
  id: SetupIssueId;
  title: string;
  detail: string;
  fix: string;
};

function p(...seg: string[]) {
  return path.join(process.cwd(), ...seg);
}

const MODELS_YAML_PATH = p("config", "models.yaml");
const MODELS_EXAMPLE_PATH = p("config", "models.example.yaml");

export function getSetupIssues(): SetupIssue[] {
  const issues: SetupIssue[] = [];

  if (!process.env.DATABASE_URL) {
    issues.push({
      id: SetupIssueId.DatabaseUrl,
      title: "DATABASE_URL is not set",
      detail: "PostgreSQL connection string is missing.",
      fix: "Copy web/.env.example to web/.env, set DATABASE_URL, then restart the dev server.",
    });
  }

  if (!fs.existsSync(MODELS_YAML_PATH)) {
    const hasExample = fs.existsSync(MODELS_EXAMPLE_PATH);
    issues.push({
      id: SetupIssueId.ModelsYaml,
      title: "models.yaml is missing",
      detail: "Model configuration file is not found.",
      fix: hasExample
        ? "Copy config/models.example.yaml to config/models.yaml and edit as needed."
        : "Create config/models.yaml (models.example.yaml was not found either).",
    });
  }

  return issues;
}
