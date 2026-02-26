# クイックスタート

このガイドでは、JuryArena をローカル環境でセットアップし、動作確認するまでの手順を説明します。

## 前提条件

- **Docker** および **Docker Compose** が利用可能であること
- **Node.js** v24.x 以上がインストールされていること

## 1. リポジトリのクローン

```bash
git clone https://github.com/elementshq/jury-arena.git
cd jury-arena
```

## 2. 環境変数の設定

Web アプリケーション用の環境変数ファイルを作成します。

```bash
cp web/.env.example web/.env
```

必要に応じて `web/.env` を編集し、LLM の API キーなどを設定してください。
API キーの詳細な設定方法については[LLM Configuration › APIキー設定](./guides/llm-configuration#apiキー設定) を参照してください。


## 3. LLMの設定

評価に使用するLLMを設定します。

```bash
cp web/config/models.example.yaml web/config/models.yaml
```

必要に応じて `web/config/models.yaml` の値を編集してください。
詳細な設定方法については[LLM Configuration](./guides/llm-configuration) を参照してください。

## 4. 起動

Docker Compose を使用してアプリケーションを起動します。

```bash
cd infra
docker compose up -d
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開き、ダッシュボードが表示されることを確認してください。

## 次のステップ

- プロジェクト全体の構成については [概要](./) を参照してください。
