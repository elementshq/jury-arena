import type * as React from "react";

import {
  AnthropicIcon,
  BytedanceIcon,
  DeepSeekIcon,
  GoogleIcon,
  GrokIcon,
  MetaIcon,
  MistralIcon,
  MinimaxIcon,
  OpenAIIcon,
  QwenIcon,
  MoonshotaiIcon,
  XiaomiIcon,
  ZaiIcon,
  UnknownIcon,
} from "./providers";

export const Provider = {
  Anthropic: "anthropic",
  Bytedance: "bytedance",
  DeepSeek: "deepseek",
  Google: "google",
  OpenAI: "openai",
  Grok: "grok",
  Meta: "meta",
  Minimax: "minimax",
  Mistral: "mistral",
  Moonshotai: "moonshotai",
  Qwen: "qwen",
  Xiaomi: "xiaomi",
  Zai: "zai",
  Unknown: "unknown",
} as const;

export type Provider = (typeof Provider)[keyof typeof Provider];

export type ProviderIconComponent = React.FC<React.SVGProps<SVGSVGElement>>;

export const PROVIDER_ICONS: Record<Provider, ProviderIconComponent> = {
  [Provider.Anthropic]: AnthropicIcon,
  [Provider.Bytedance]: BytedanceIcon,
  [Provider.DeepSeek]: DeepSeekIcon,
  [Provider.Google]: GoogleIcon,
  [Provider.OpenAI]: OpenAIIcon,
  [Provider.Grok]: GrokIcon,
  [Provider.Meta]: MetaIcon,
  [Provider.Minimax]: MinimaxIcon,
  [Provider.Mistral]: MistralIcon,
  [Provider.Moonshotai]: MoonshotaiIcon,
  [Provider.Qwen]: QwenIcon,
  [Provider.Xiaomi]: XiaomiIcon,
  [Provider.Zai]: ZaiIcon,
  [Provider.Unknown]: UnknownIcon,
};

type ModelIconProps = {
  provider?: Provider | null;
  size?: number | string;
  className?: string;
  decorative?: boolean;
};

export function ModelIcon({
  provider,
  size = 14,
  className,
  decorative = true,
}: ModelIconProps) {
  const Icon =
    provider && provider in PROVIDER_ICONS
      ? PROVIDER_ICONS[provider]
      : PROVIDER_ICONS[Provider.Unknown];

  const sizeProps =
    typeof size === "number" ? { width: size, height: size } : undefined;

  return <Icon {...sizeProps} className={className} aria-hidden={decorative} />;
}
