# Data Format

JuryArena accepts evaluation data in **JSONL** or **ZIP** format.

## JSONL Format

JSONL is a text format where each line is an independent JSON object.

One line = one sample.

### Minimal Example

```json
{"input":{"messages":[{"role":"user","content":"Write a Python program that reads all text files in a directory and returns the top 5 most frequent words."}]},"usage_output":null}
```

Expanded:

```json
{
  "input": {
    "messages": [
      {
        "role": "user",
        "content": "Write a Python program that reads all text files in a directory and returns the top 5 most frequent words."
      }
    ]
  },
  "usage_output": null
}
```

## Field Structure

### input.messages

OpenAI-compatible message format.

```json
{
  "input": {
    "messages": [
      {
        "role": "user",
        "content": "Your question here"
      }
    ]
  },
  "usage_output": null
}
```

#### role

* `system`
* `user`
* `assistant`

#### content

* A string
* Or structured content (see below)

### usage_output

Typically set to `null`.

This is a reserved field for future extensibility.

## ZIP Format (File Attachment Support)

To handle file attachments such as PDFs, upload a ZIP file.

### Structure Example

```
dataset.zip
  samples.jsonl
  attachments/
    doc1.pdf
    doc2.pdf
```

### Rules

* `samples.jsonl` is required inside the ZIP
* Attachments must be placed under `attachments/`
* Do not embed file contents directly inside the JSONL

## Using file_ref

Inside `samples.jsonl`, reference attachments using the `file_ref` format:

```json
{
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Please summarize this PDF"
          },
          {
            "type": "file_ref",
            "path": "attachments/doc1.pdf"
          }
        ]
      }
    ]
  },
  "usage_output": null
}
```

## What is file_ref?

`file_ref` is an application-internal intermediate representation (IR).

* LLMs do not interpret it directly
* At execution time, the Worker converts it to the input format required by each provider
* This abstracts away differences between OpenAI, Anthropic, Gemini, and other providers

## Validation

Uploaded JSONL is validated against the internal schema:

* Each line is parsed as JSON
* Lines that do not conform to the schema result in an error
* Errors are returned with line numbers

Example:

```
line 12: input.messages.0.role: Invalid enum value
```

## Design Philosophy

JuryArena preserves a format close to production logs while adopting a provider-agnostic intermediate representation.

This enables:

* Abstraction of differences across LLM providers
* Support for future extensibility
* Separation of evaluation logic from input/output format

## Next Steps

* For the actual evaluation procedure, see [Running Benchmarks](./running-benchmarks).
* For how evaluation works, see [Arena Evaluation](../concepts/arena-evaluation).
