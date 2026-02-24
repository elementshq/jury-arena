import type { ModelDefinition, ModelInputCapabilities } from "./models-types";

/**
 * Check if a model supports a specific input type and format
 *
 * @param model - Model definition to check
 * @param inputType - Type of input (e.g., "pdf", "image")
 * @param format - Format of input (e.g., "base64", "url")
 * @returns true if the model supports the input type in the specified format
 */
export function supportsInput(
  model: ModelDefinition,
  inputType: keyof ModelInputCapabilities,
  format: "base64" | "url" | "text"
): boolean {
  const inputs = model.capabilities?.inputs;
  if (!inputs) return false;

  const supportedFormats = inputs[inputType];
  if (!supportedFormats) return false;

  // Type-safe check: each format array contains strings that can be checked
  return (supportedFormats as string[]).includes(format);
}

/**
 * Check if a model supports PDF input via base64
 *
 * @param model - Model definition to check
 * @returns true if the model supports PDF base64 input
 */
export function supportsPdfBase64(model: ModelDefinition): boolean {
  return supportsInput(model, "pdf", "base64");
}

/**
 * Check if a model supports image input via base64
 *
 * @param model - Model definition to check
 * @returns true if the model supports image base64 input
 */
export function supportsImageBase64(model: ModelDefinition): boolean {
  return supportsInput(model, "image", "base64");
}
