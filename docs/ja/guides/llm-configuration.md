
# LLM設定

JuryArena では、評価に使用するLLMを `models.yaml` で定義します。

この設定により、

- Evaluation 画面で選択可能なLLM一覧
- 入力形式のサポート状況

を管理します。



## 設定ファイルの場所

```
web/config/models.yaml
````

初回セットアップ時は以下をコピーしてください。

```bash
cp web/config/models.example.yaml web/config/models.yaml
```



## 基本構造

```yaml
model_list:
  - model: provider/model-name
    capabilities:
      inputs:
        pdf: ["base64"]
```


## Model identifier format

JuryArena は LiteLLM を通じて各 LLM プロバイダーへリクエストを送信します。

そのため、`model` には **LiteLLM のモデル識別子（provider/model）形式** を指定します。

JuryArena はこの文字列を内部で変換せず、LiteLLM にそのまま渡してルーティングを委譲します。

例:

* `openai/gpt-5`
* `gemini/gemini-2.5-pro`
* `openrouter/anthropic/claude-sonnet-4.5`

他のモデルを追加したい場合は、LiteLLM がサポートしているプロバイダー名およびモデル名に従って記述してください。

どの識別子が利用可能かは、LiteLLM のドキュメント（Providers / Models）を参照してください。


## capabilities.inputs

`capabilities` は、モデルが受け付け可能な入力形式を宣言します。

例:

```yaml
capabilities:
  inputs:
    pdf: ["base64"]
```

意味:

* PDF入力をサポート
* base64形式で渡される

未対応モデルの場合は空オブジェクトを指定します。

```yaml
capabilities:
  inputs: {}
```



## サポート可能な入力タイプ

現在の主な入力タイプ:

- `pdf`
  - 形式: `base64`

例: 

```yaml
capabilities:
  inputs:
    pdf: ["base64"]
```
PDF は base64 形式でエンコードされ、実行時に各プロバイダーへ適切な形式へ変換されます。

### 非対応項目

現時点では、以下はサポートしていません。

* 画像ファイル入力
* LLM ベンダー固有の Files API
* URL 参照形式（外部リンク経由のファイル取得）

JuryArena は、プロバイダー固有のファイル管理機構に依存せず、
プロバイダー非依存な中間表現（IR）を採用しています。

添付ファイルを含むデータセットを評価する場合は、
対象モデルが対応する入力タイプをサポートしている必要があります。


## 完全な設定例

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



## PDF対応について

PDFを含むデータセットを評価する場合:

* モデル側が `pdf: ["base64"]` をサポートしている必要があります
* 未対応モデルは Evaluation 作成時に制限されます

JuryArena は内部で `file_ref` を解決し、
各 Provider に適した形式へ変換します。



## モデル追加手順

1. `models.yaml` にエントリを追加
2. サーバーを再起動
3. Evaluation 画面に表示されることを確認



## APIキー設定

各プロバイダーの API キーは環境変数で設定します。

例:

```
OPENAI_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
```

JuryArena は LiteLLM を通じてリクエストを送信するため、
LiteLLM が参照する環境変数に準拠します。



## 設計思想

JuryArena は、

* Provider非依存なモデル指定
* 入力能力の明示的宣言
* 実行時変換による抽象化

を採用しています。

これにより、

* 複数プロバイダー間での公平な比較
* 添付ファイル対応の明確化
* 将来的な拡張への対応

が可能になります。



## 次のステップ

* 実際の評価実行方法は [Running Benchmarks](./running-benchmarks) を参照してください。
* アリーナ評価の仕組みは [Arena Evaluation](../concepts/arena-evaluation) を参照してください。

