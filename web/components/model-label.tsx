import { detectProvider } from "@/lib/model-providers";
import { ModelIcon } from "./icon/model-icon";

type ModelLabelProps = {
  modelName: string;
  className?: string;
  size?: "xs" | "sm" | "md";
};

export function ModelLabel({
  modelName,
  className,
  size = "md",
}: ModelLabelProps) {
  const provider = detectProvider(modelName);

  const iconSize = size === "xs" ? 10 : size === "sm" ? 14 : 16;

  const textSize =
    size === "xs"
      ? "text-[10px] leading-[1]"
      : size === "sm"
        ? "text-xs"
        : "text-md";

  const cls = `inline-flex items-center gap-1.5 font-mono ${textSize} ${className ?? ""}`;

  return (
    <div className={cls}>
      <ModelIcon
        provider={provider}
        size={iconSize}
        className="text-slate-600 shrink-0 translate-y-[1px]"
      />
      <span>{modelName}</span>
    </div>
  );
}
