# import litellm
import dotenv
import os
import requests

dotenv.load_dotenv()


"""
JS Code
fetch("https://openrouter.helicone.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Helicone-Auth": `Bearer ${HELICONE_API_KEY}`,
    "HTTP-Referer": `${YOUR_SITE_URL}`, // Optional, for including your app on openrouter.ai rankings.
    "X-Title": `${YOUR_SITE_NAME}`, // Optional. Shows in rankings on openrouter.ai.
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "openai/gpt-4o-mini", // Optional (user controls the default),
    messages: [{ role: "user", content: "What is the meaning of life?" }],
    stream: true,
  }),
});
"""


def main():
    response = requests.post(
        "https://openrouter.helicone.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
            "Helicone-Auth": f"Bearer {os.environ['HELICONE_AUTH_KEY']}",
            "X-Title": "My First Task",
            "Content-Type": "application/json",
        },
        json={
            "model": "openai/gpt-4o-mini",
            "messages": [
                {"role": "user", "content": "Write a poem about a lonely computer"}
            ],
        },
    )
    print(response.json())
    # response = litellm.completion(
    #     base_url="https://ai-gateway.helicone.ai",
    #     api_key=os.environ["HELICONE_AUTH_KEY"],
    #     model="openrouter/openai/gpt-3.5-turbo",
    #     messages=[
    #         {
    #             "role": "user",
    #             "content": "Write a poem about a lonely computer",
    #         }
    #     ],
    # )
    # print(response)


if __name__ == "__main__":
    main()
