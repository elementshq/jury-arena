# Arena Evaluation

Arena evaluation is a method of estimating the relative strength of models by having LLMs compete against each other one-on-one and accumulating the win/loss results.

Traditional benchmark evaluation requires "labeled datasets with correct answers." However, in business use cases, there are often tasks where correct answers are difficult to define, or where subjective quality judgments are required.

Arena evaluation avoids this. It shows two responses to the same prompt to another LLM (Judge) and asks only "which is better?" No ground truth data is needed, and you can use your actual production prompts as-is.

This approach became widely known through Chatbot Arena (LMSYS, 2024). JuryArena applies that concept to private task sets.


## Match Details

### Step 1 — Trial (Model Response Generation)

The selected pair (Model A and Model B) each independently run inference on the same Sample (Trial).

Trial results are cached. If the same Sample and model combination is used in another Match, the API is not called and the result is read from cache.

Cases where a Trial is skipped:

| Reason | Skip Code |
|--------|-----------|
| Model does not support PDF input | `UNSUPPORTED_INPUT` |
| Context length exceeded | `CONTEXT_OVERFLOW` |
| API internal error (retry limit reached) | `API_ERROR` |
| Other errors | `OTHER_ERROR` |

If either model's Trial is skipped, the Judge is not run and the Match is forced to a **tie** (only Coverage decreases; Rating is not affected).

### Step 2 — Building the Judge Message

The following information is passed together to the Judge.

```
[User input messages]          ← Sample messages included as-is
                                  Files such as PDFs are included as base64
[Evaluation instructions + Response A + Response B]   ← The following prompt is added
```

Evaluation prompt (when language is set to English):

```
You are a fair judge. Compare the two LLM responses to the user input above and determine which one is better.

Respond in English.

Answer A:
{model_a output}

Answer B:
{model_b output}

Evaluate based on the following criteria:
1. Accuracy: Is the response correct?
2. Instruction-following: Does it follow the prompt instructions?
3. Completeness: Does it include all information specified in the prompt?
4. Clarity: Is it easy to understand?
5. Conciseness: Is it free of unnecessary content?
```

The A/B assignment (which model is Model A and which is Model B) is randomized at pair selection time. This prevents **position bias**, where the Judge always favors the same position.

### Step 3 — Running the Judge

The Judge model returns the following JSON as structured output.

```json
{
  "A": "Evaluation comment for Response A",
  "B": "Evaluation comment for Response B",
  "reason": "Reasoning for the judgment",
  "winner": "A" | "B" | "tie"
}
```

When multiple Judge models are configured, they are executed **in parallel**.

Error handling:

| Situation | Behavior |
|-----------|----------|
| `InternalServerError` | Retry up to 2 times (exponential backoff), then tie |
| Empty response | tie |
| JSON parse failure | tie |
| PDF sent to a model that does not support PDF | Skip that model |
| Other exceptions | tie (no retry) |

### Step 4 — Majority Vote and Winner Determination

Results from multiple Judges are aggregated by majority vote.

```
Judge 1 → Model A wins
Judge 2 → Model A wins    →  Final winner: Model A
Judge 3 → tie
```

In case of a tie vote, the label that first reaches the maximum count is selected.

The determined winner (Model A name, Model B name, or "tie") is recorded as the Match result and used for rating updates after the Step.

## Pair Selection

The algorithm for determining which pairs compete is linked to the rating system. For details, see [Rating System](./rating-system).

## References

- **Chatbot Arena**: Chiang et al. (2024). *Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference*. ICML 2024. https://arxiv.org/abs/2403.04132
- **LLM-as-a-Judge**: Zheng et al. (2023). *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*. NeurIPS 2023. https://arxiv.org/abs/2306.05685
- For **Elo rating and Glicko-2**, see the references in [Rating System](./rating-system).
