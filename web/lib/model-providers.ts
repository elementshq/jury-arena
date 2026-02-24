import { Provider } from "@/components/icon/model-icon";

const PROVIDER_PREFIX_RULES: Array<{
  provider: Provider;
  prefixes: string[];
}> = [
  {
    provider: Provider.OpenAI,
    prefixes: ["gpt-", "o3-", "o4-"],
  },
  {
    provider: Provider.Anthropic,
    prefixes: ["claude-"],
  },
  {
    provider: Provider.Google,
    prefixes: ["gemini-", "gemma-"],
  },
  {
    provider: Provider.Grok,
    prefixes: ["grok-"],
  },
  {
    provider: Provider.Meta,
    prefixes: ["llama-", "meta-"],
  },
  {
    provider: Provider.Mistral,
    prefixes: ["mistral-"],
  },
  {
    provider: Provider.DeepSeek,
    prefixes: ["deepseek-"],
  },
];

export function detectProvider(modelName?: string | null): Provider {
  if (!modelName) return Provider.Unknown;

  const name = modelName.toLowerCase();

  let matchedProvider: Provider = Provider.Unknown;
  let earliestIndex = Infinity;

  for (const rule of PROVIDER_PREFIX_RULES) {
    for (const prefix of rule.prefixes) {
      const index = name.indexOf(prefix);
      if (index !== -1 && index < earliestIndex) {
        earliestIndex = index;
        matchedProvider = rule.provider;
      }
    }
  }

  return matchedProvider;
}
