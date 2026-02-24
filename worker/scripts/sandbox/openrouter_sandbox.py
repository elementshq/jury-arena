import os
import litellm
import dotenv

dotenv.load_dotenv()

# os.environ["OPENROUTER_API_KEY"] = ""
# os.environ["OPENROUTER_API_BASE"] = "" # [OPTIONAL] defaults to https://openrouter.ai/api/v1

# os.environ["OR_SITE_URL"] = "" # [OPTIONAL]
# os.environ["OR_APP_NAME"] = "" # [OPTIONAL]


def main():
    response = litellm.completion(
        model="openrouter/openai/gpt-3.5-turbo",
        messages=[
            {
                "role": "user",
                "content": "Write a poem about a lonely computer",
            }
        ],
    )
    print(response)


def main2():
    response = litellm.completion(
        model="openrouter/x-ai/grok-4-fast",
        messages=[
            {
                "role": "user",
                "content": "Write something, Please output in JSON format.",
            }
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "response",
                "strict": True,
                "schema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "type": "object",
                    "properties": {
                        "elements": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {
                                        "type": "string",
                                        "minLength": 1,
                                        "description": "記事のタイトル。日本語で記載してください。",
                                    },
                                    "sectionTitles": {
                                        "type": "array",
                                        "items": {"type": "string", "minLength": 1},
                                        "description": "記事のセクションのタイトル。日本語で記載してください。",
                                    },
                                    "contentPlan": {
                                        "type": "object",
                                        "properties": {
                                            "gist": {
                                                "type": "string",
                                                "minLength": 1,
                                                "description": "記事の主旨。記事で伝えたいメインメッセージやコンセプトを記載してください。",
                                            },
                                            "feature": {
                                                "type": "string",
                                                "minLength": 1,
                                                "description": "記事の特徴。他の記事と差別化できる独自の視点やアプローチを記載してください。",
                                            },
                                            "merit": {
                                                "type": "string",
                                                "minLength": 1,
                                                "description": "読者のメリット。この記事を読むことで読者が得られる具体的な価値や解決できる課題を記載してください。",
                                            },
                                        },
                                        "required": ["gist", "feature", "merit"],
                                        "additionalProperties": False,
                                        "description": "記事の構成や狙いについての説明。",
                                    },
                                },
                                "required": ["title", "sectionTitles", "contentPlan"],
                                "additionalProperties": False,
                            },
                        }
                    },
                    "required": ["elements"],
                    "additionalProperties": False,
                },
            },
        },
    )
    print(response)


if __name__ == "__main__":
    main2()
