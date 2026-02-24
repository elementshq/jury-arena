# 用語集

## データセット（Dataset）

Arena における評価は、あらかじめ用意された **Dataset** を入力として実行されます。
Dataset は評価の最小単位である **Sample** の集合で構成されます。

- **Sample**：実務で使用された LLM リクエストのログを 評価用に加工したデータ。

Sample は、同一条件で複数のモデルを比較するための共通入力として使用されます。
入力プロンプト（input prompt）を中心に構成され、評価の再現性を担保する役割を持ちます。

```js
Dataset
 └─ Sample
```



## 評価（Evaluation）

評価（Evaluation）は、Sample を入力として複数のモデルを比較し、その結果を集計・指標化するプロセスです。
Arena では、この評価プロセスをいくつかの概念的な単位に分解して扱います。

### Match / Trial / Model の関係

- **Match**：モデルのペア（Candidate Model A, B）を比較する 1 回の対戦。
- **Trial**：1つのモデルが、1つの Sample に対して応答を生成する単発の推論実行単位。
- **CandidateModel**：評価の対象となるモデル。
- **JudgeModel**：判定・採点を行うモデル。
- **BaselineModel**：比較の基準として重点的に対戦するモデル（オプション）。

Match は必ずモデルの「ペア」を前提とした比較単位であり、その内部で各モデルがそれぞれ Trial を実行します。生成された出力は、1つまたは複数の JudgeModel によって比較・判定されます。

```js
Match（モデルのペアを比較する 1 回の対戦）
  ├─ Trial（Candidate Model A）
  ├─ Trial（Candidate Model B）
  └─ Judge（Judge Model）x N (N=1~3)
```



## Step と Rating

評価は単発の Match だけで完結せず、複数の対戦結果をまとめて集計することで、モデル間の相対的な強さを安定して推定します。

- **Step**：複数の対戦をまとめて行い、その勝敗をもとに Rating を更新する単位。
- **Rating**：対戦の結果を集計して算出されるモデルの相対的な評価指標。勝敗、スコア、比較結果などをもとに更新され、モデル間の強さを表す。

1つの Step には複数の Sample に対する Match が含まれます。
各 Match の結果を集計し、Step の終了時に Rating が更新されます。

```js
Step（Rating 更新の単位）
└─ Match × N
   ├─ Sample #1 → Match → Result
   ├─ Sample #2 → Match → Result
   ├─ Sample #3 → Match → Result
   └─ ...
        ↓
   Rating Update
```

この構造により、特定の Sample に依存しすぎない、安定した評価が可能になります。



## コスト指標（Cost Metrics）

Arena では、性能評価に加えてコストの可視化も重視します。

評価全体のコストは、推論を行うモデルと判定を行うモデルに分けて管理されます。

- **TotalCost**：評価全体で発生したモデル応答のコストの合計。評価対象モデルの推論コストと、Judge による判定コストを含む。
- **TrialCost**：評価対象モデルが各 Trial で生成した応答に対して発生した推論コストの合計。
- **JudgeCost**：各 Trial の結果を判定するために JudgeModel が生成した出力に対して発生した推論コストの合計。

これらの指標により、「性能が高いが高コストなモデル」と
「性能とコストのバランスが良いモデル」を明確に区別できます。



## TopRatingModel

- **TopRatingModel**：Rating がトップのモデル。

TopRatingModel は、現時点で Arena 上において最も高い評価を得ているモデルを示します。
あくまで相対評価の結果であり、Dataset や評価条件が変われば更新される前提の指標です。



## Coverage

Coverage は、評価がどれだけ成立したかを示す指標です。
Rating（強さ）とは独立して、評価の成立度・実行耐性を表します。

### Session Coverage

評価セッション全体で、実際に成立した Match の割合。

```js
Session Coverage = 成立 Match 数 / 予定 Match 数
```

評価そのものの信頼性を示します。

### Model Coverage

特定のモデルが、参加した Match をどれだけ完走できたかの割合。

```js
Model Coverage = 完走 Match 数 / 参加 Match 数
```

モデルの実行安定性を示します。

### Rating との関係

* Rating は成立した Match のみで更新される
* 不成立（No Contest）は Rating に影響せず、Coverage のみ低下する

これにより、**強さ（Rating）と実行耐性（Coverage）を分離して評価**できます。
