
# データフォーマット

JuryArena では、評価対象となるデータを **JSONL** または **ZIP** 形式で登録できます。

## JSONL フォーマット

JSONL は、各行が独立した JSON オブジェクトであるテキスト形式です。

1行 = 1サンプルです。

### 最小構成例

```json
{"input":{"messages":[{"role":"user","content":"ディレクトリ内の全てのテキストファイルを読み込み、出現回数が最も多い上位5単語を返すPythonプログラムを開発してください。"}]},"usage_output":null}
```

上記の内容を展開すると以下の通りです。
```json
{
  "input": {
    "messages": [
      {
        "role": "user",
        "content": "ディレクトリ内の全てのテキストファイルを読み込み、出現回数が最も多い上位5単語を返すPythonプログラムを開発してください。"
      }
    ]
  },
  "usage_output": null
}

```


## フィールド構造

### input.messages

OpenAI 互換のメッセージ形式です。

```json
{
  "input": {
    "messages": [
      {
        "role": "user",
        "content": "質問内容"
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

* 文字列
* または構造化コンテンツ（後述）


### usage_output

通常は `null` を指定します。

将来的な拡張用フィールドです。


## ZIP フォーマット（添付ファイル対応）

PDF などの添付ファイルを扱う場合は、ZIP 形式でアップロードします。

### 構成例

```
dataset.zip
  samples.jsonl
  attachments/
    doc1.pdf
    doc2.pdf
```

### ルール

* ZIP内に `samples.jsonl` が必須
* 添付ファイルは `attachments/` 配下に配置
* JSONL 内ではファイルを直接埋め込まない



## file_ref の使用例

`samples.jsonl` 内では、添付ファイルは参照形式で記述します。

```json
{
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "このPDFを要約してください"
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


## file_ref とは

`file_ref` はアプリケーション内部の中間表現（IR）です。

* LLM が直接解釈することはありません
* 実行時に Worker が Provider ごとの入力形式へ変換します
* OpenAI、Anthropic、Gemini などの差異を吸収します



## バリデーション

アップロードされた JSONL は内部スキーマに基づいて検証されます。

* 各行は JSON としてパースされます
* スキーマに適合しない場合、エラーになります
* エラーは行番号付きで返されます

例:

```
line 12: input.messages.0.role: Invalid enum value
```

## 設計思想

JuryArena は、実務ログに近い形式を保ちながら、
プロバイダ非依存の中間表現を採用しています。

これにより:

* LLMプロバイダの差異を吸収
* 将来的な拡張に対応
* 評価ロジックと入出力形式を分離


## 次のステップ

* 実際の評価手順は [Running Benchmarks](./running-benchmarks) を参照してください。
* 評価の仕組みは [Arena Evaluation](../concepts/arena-evaluation) を参照してください。
