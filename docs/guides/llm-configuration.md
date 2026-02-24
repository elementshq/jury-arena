# LLM Configuration

JuryArena defines the LLMs used for evaluation in `models.yaml`.

This configuration controls:

- The list of LLMs available for selection in the Evaluation UI
- Which input formats each model supports

## Configuration File Location

```
web/config/models.yaml
```

On first setup, copy the example file:

```bash
cp web/config/models.example.yaml web/config/models.yaml
```

## Basic Structure

```yaml
model_list:
  - model: provider/model-name
    capabilities:
      inputs:
        pdf: ["base64"]
```

## Model Identifier Format

JuryArena sends requests to LLM providers via LiteLLM.

Therefore, `model` must be specified in the **LiteLLM model identifier format (`provider/model`)**.

JuryArena passes this string directly to LiteLLM without any internal transformation, delegating routing to LiteLLM.

Examples:

* `openai/gpt-5`
* `gemini/gemini-2.5-pro`
* `openrouter/anthropic/claude-sonnet-4.5`

To add other models, use the provider name and model name supported by LiteLLM.
Refer to the LiteLLM documentation (Providers / Models) for available identifiers.

## capabilities.inputs

`capabilities` declares the input formats a model accepts.

Example:

```yaml
capabilities:
  inputs:
    pdf: ["base64"]
```

Meaning:

* PDF input is supported
* The PDF is passed as base64

For models that don't support any file inputs, specify an empty object:

```yaml
capabilities:
  inputs: {}
```

## Supported Input Types

Current primary input types:

- `pdf`
  - Format: `base64`

Example:

```yaml
capabilities:
  inputs:
    pdf: ["base64"]
```

PDFs are base64-encoded and converted to the appropriate format for each provider at runtime.

### Not Currently Supported

The following are not currently supported:

* Image file input
* LLM vendor-specific Files APIs
* URL reference format (fetching files via external links)

JuryArena adopts a provider-agnostic intermediate representation (IR) rather than depending on provider-specific file management mechanisms.

When evaluating datasets that contain attachments, the target models must support the relevant input types.

## Full Configuration Example

```yaml
model_list:
  - model: openai/gpt-5
    capabilities:
      inputs:
        pdf: ["base64"]

  - model: gemini/gemini-2.5-pro
    capabilities:
      inputs:
        pdf: ["base64"]

  - model: openrouter/meta-llama/llama-3.3-70b-instruct
    capabilities:
      inputs: {}
```

## PDF Support

When evaluating datasets that contain PDFs:

* The model must have `pdf: ["base64"]` declared in its capabilities
* Models without PDF support will be restricted at Evaluation creation time

JuryArena resolves `file_ref` internally and converts it to the appropriate format for each provider.

## Adding a Model

1. Add an entry to `models.yaml`
2. Restart the server
3. Confirm the model appears in the Evaluation UI

## API Keys

API keys for each provider are configured via environment variables.

Example:

```
OPENAI_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
```

Since JuryArena sends requests through LiteLLM, it follows the environment variable conventions that LiteLLM expects.

## Design Philosophy

JuryArena adopts:

* Provider-agnostic model identifiers
* Explicit declaration of input capabilities
* Runtime conversion for abstraction

This enables:

* Fair comparison across multiple providers
* Clear indication of file attachment support
* Extensibility for future additions

## Next Steps

* For the evaluation execution flow, see [Running Benchmarks](./running-benchmarks).
* For how arena evaluation works, see [Arena Evaluation](../concepts/arena-evaluation).
