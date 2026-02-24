# Running Benchmarks

This page walks through the end-to-end flow for running an arena evaluation in JuryArena.

Evaluation starts with creating a dataset and proceeds through configuring and running an Evaluation.

## 1. Create a Dataset

If no dataset exists, the message "Add data for evaluation" is shown in the center of the screen.

You can create a dataset in one of the following ways:

- **Upload**: Upload a JSONL or ZIP file
- **Use template**: Use the built-in sample data

The template contains sample data ready for arena evaluation, so you can run an evaluation immediately without any additional preparation.

If you already have production logs, upload a JSONL or ZIP file via **Upload**.

For details on the data format, see [Data Format](./data-format).

## 2. Create a New Evaluation

Click your dataset, then click **New Evaluation** in the top-right corner.

Configure the following settings:

### Candidate Model

Select the models to compare against each other.

### Judge Model

Select the Judge model(s) used to evaluate responses.
Up to 3 Judge models can be selected.

### Max Matches

Specify the number of matches to run (e.g., 100).

More matches produce more stable ratings, but increase both execution time and cost.

### Judge Output Language

Select the language for Judge output.

## 4. Run the Evaluation

After configuring, click **Run** to start the evaluation.

JuryArena evaluates in the following flow:

1. Two LLMs each generate a response to the same prompt
2. A Judge LLM compares the two responses and determines a winner
3. Ratings are updated based on the match result
4. The next match pairs LLMs with similar ratings
5. The process repeats until the specified Max Matches is reached

Evaluation runs asynchronously in the background.
Progress and intermediate results can be monitored from the dashboard.

## 5. Review Results

After evaluation completes, you can review:

- Model rankings (sorted by rating)
- Rating progression
- Details of each match
- Judge reasoning
- Cost and latency

These help you understand the relative performance trends of each model.

## Notes

- Ratings are relative evaluations.
- Results depend on the prompt composition and the Judge model used.

## Next Steps

- For details on how arena evaluation works, see [Arena Evaluation](../concepts/arena-evaluation).
- For details on the rating algorithm, see [Rating System](../concepts/rating-system).
