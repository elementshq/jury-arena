import yaml from "js-yaml";
import type { BenchmarkConfig } from "./schema";

export function configToYaml(config: BenchmarkConfig): string {
  // js-yamlは順序をある程度保つが、完全にこだわるならキー順を自前で整形
  return yaml.dump(config, {
    noRefs: true,
    lineWidth: 120,
  });
}
