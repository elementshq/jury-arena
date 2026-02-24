# Rating System

The Arena continuously estimates the **relative strength** of each model based on multiple match results.

This estimation is performed by the **rating system**.

Two systems are currently implemented — **Elo** and **Glicko-2** — and either can be selected when configuring an evaluation.

## Why Ratings Are Needed

Match results alone cannot stably compare the strength of models:

- The meaning of a win or loss depends on the opponent's strength
- A small number of matches is heavily influenced by chance
- Directly comparing all models would require an enormous number of matches

Using a rating system enables **indirect comparison** (if A beats B and B beats C, we can infer A > C), allowing stable rankings to be built with fewer matches.

## Elo Rating System

The classic rating system used in chess. Simple, easy to understand, and computationally inexpensive.

### How It Works

Each model has a rating value (default 1500).

Before each match, the **expected win probability** is calculated, and ratings shift based on the difference from the actual outcome:

```
Expected score = 1 / (1 + 10^((opponent rating - own rating) / 400))
```

- Expected outcome (stronger model wins) → small rating change
- Upset (weaker model wins) → large rating change

Elo is a **zero-sum** game: points gained by the winner equal points lost by the loser.

### K-Factor

A parameter that controls the magnitude of rating changes. Models with less match experience get a higher K-factor, resolving initial uncertainty more quickly.

| Matches Played | K-Factor | Meaning |
|----------------|----------|---------|
| 0–9 | 32 (initial) | Unknown models move a lot |
| 10–29 | 16 (default) | Normal range of change |
| 30+ | 10 (stable) | Stable models move little |

### Elo's Limitations

Elo only tracks a single rating value, so it carries **no information about how reliable that rating is**. Two models with the same rating — one with few matches and one with many — should have different uncertainty levels, but Elo cannot distinguish between them.

## Glicko-2 Rating System

An extension of Elo by Mark Glickman (2013). Achieves more accurate evaluation by tracking **uncertainty** and **volatility** alongside the rating.

### Three Parameters

Glicko-2 represents each model with three values:

| Parameter | Symbol | Meaning | Initial Value |
|-----------|--------|---------|---------------|
| Rating | μ (mu) | Estimated model strength | 1500 |
| Rating Deviation | φ (phi) | Rating uncertainty. Larger means less reliable | 350 |
| Volatility | σ (sigma) | Performance consistency. Larger means more erratic results | 0.06 |

**φ (RD: Rating Deviation)** is the core of Glicko-2.

- New model (few matches): large φ → low confidence in rating
- Experienced model (many matches): small φ → high confidence in rating

After matches, φ shrinks (uncertainty decreases). During periods without matches, φ grows (performance may have changed).

### Expected Score and the g Function

Glicko-2's expected score accounts for the opponent's RD:

```
g(φ_j) = 1 / √(1 + 3φ_j² / π²)        ← attenuation function for opponent RD
E(μ, μ_j, φ_j) = 1 / (1 + exp(-g(φ_j) × (μ - μ_j)))   ← expected score
```

Matches against opponents with high RD (low reliability) have a weaker influence on rating updates. This prevents results against unreliable opponents from being over-weighted.

## Batch Update (Glicko-2)

Arena evaluation progresses in **Step** units, with each Step containing multiple Matches (see [Terminology](./terminology)).

Per the Glicko-2 specification, all Matches within a single Step are treated as **one rating period** and processed together. This is called a **batch update**.

### Why Batch Updates Matter

Sequential updates (updating after each Match in order) have these problems:

- **RD over-shrinkage**: Models participating in multiple Matches have their RD shrunk after each Match, leading to overconfident estimates
- **Order dependency**: Results vary depending on which Match is processed first, preventing deterministic outcomes

With batch updates, all Match opponent information is built using **pre-batch ratings** (ratings before the Step starts), and all models are then updated together.

```
Step begins
  ↓
Snapshot pre-batch ratings for all models
  ↓
Build opponent information for each Match using pre-batch ratings
  ↓
Update all models simultaneously using their full opponent lists
  ↓
Step ends
```

This ensures **deterministic results independent of the order in which Matches complete**.

> **Note**: Elo uses sequential updates by default. The difference between sequential and batch updates is small for Elo, so this consideration is specific to Glicko-2.

## Pair Selection Algorithms

Which models are matched against each other also significantly affects evaluation efficiency. JuryArena provides pair selection algorithms matched to each rating system.

### BaselineStarSelector (for Elo)

A strategy that centers matches around a baseline model, pitting it against all other models.

- Combines baseline vs. all matches with non-baseline vs. non-baseline matches
- The `nonbaseline_ratio` parameter adjusts the proportion of non-baseline matches (0.0–1.0)
- Prefers pairs with similar ratings (`prefer_close_ratings`)
- Avoids repeated recent match-ups (`avoid_recent_duplicates`)

### Glicko2Selector (for Glicko-2)

An information-theoretic selection algorithm that leverages φ (RD). Selects pairs based on **Expected Variance Reduction**:

```
Fisher information:           I_ij = g(φ_j)² × E × (1 - E)
Expected variance reduction:  gain = φ⁴ × I / (1 + φ² × I)
Pair score:                   score = gain_i + gain_j
```

This score naturally reflects:

| Property | Reason |
|----------|--------|
| Models with larger φ are prioritized | φ⁴ factor |
| Pairs with similar ratings are more informative | E×(1−E) is maximized when E ≈ 0.5 |
| Matches against reliable opponents are more informative | Smaller opponent RD → higher quality information |

The `baseline_weight` parameter adjusts the ratio between pure Glicko-2-based selection and baseline matches.

## Choosing Between Elo and Glicko-2

| Aspect | Elo | Glicko-2 |
|--------|-----|----------|
| Uncertainty tracking | None | Yes (φ) |
| Pair selection optimization | Basic | Information-maximizing via φ |
| Computational cost | Low | Medium (uses Illinois algorithm) |
| Accuracy with few matches | Low | High |
| Interpretability | High (single value) | Medium (3 parameters) |

**Glicko-2** is recommended for most use cases. Its advantage is especially pronounced in the early stages of evaluation when you want to quickly distinguish between models, or when the number of matches is limited.

## References

- **Elo**: Arpad Elo (1960s), *The Rating of Chessplayers, Past and Present*
- **Glicko-2**: Mark Glickman (2013), *Example of the Glicko-2 system* — http://www.glicko.net/glicko/glicko2.pdf
