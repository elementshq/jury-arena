import { z } from "zod";

/**
 * Model input capabilities schema
 * Defines what input types a model can accept and in what format
 */
export const ModelInputCapabilitiesSchema = z.object({
  pdf: z.array(z.enum(["base64", "url", "text"])).optional(),
  image: z.array(z.enum(["base64", "url"])).optional(),
  audio: z.array(z.enum(["base64", "url"])).optional(),
});

/**
 * Model capabilities schema
 * Container for all model capability definitions
 */
export const ModelCapabilitiesSchema = z.object({
  inputs: ModelInputCapabilitiesSchema.optional(),
});

/**
 * Individual model definition schema
 */
export const ModelDefinitionSchema = z.object({
  model: z.string().min(1),
  capabilities: ModelCapabilitiesSchema.optional(),
  display_name: z.string().optional(),
});

/**
 * Root models.yaml schema
 */
export const ModelsYamlSchema = z.object({
  model_list: z.array(ModelDefinitionSchema),
});

export type ModelInputCapabilities = z.infer<typeof ModelInputCapabilitiesSchema>;
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>;
export type ModelsYaml = z.infer<typeof ModelsYamlSchema>;
