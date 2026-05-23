import json
import os

import openai
from dotenv import load_dotenv

load_dotenv()

client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("MODEL_NAME", "gpt-4o")


async def llm_call(system_prompt: str, user_prompt: str) -> str:
    """Shared LLM caller. All agents use this."""
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            if not content:
                raise ValueError("Empty response from language model")
            return content
        except Exception as exc:
            last_error = exc
            if attempt == 0:
                continue
            raise RuntimeError(f"LLM call failed after retry: {exc}") from exc
    raise RuntimeError(f"LLM call failed: {last_error}")


def parse_json_response(raw: str) -> dict:
    """Safely parse LLM JSON output. Strips markdown fences if present."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1]
        cleaned = cleaned.rsplit("```", 1)[0]
    return json.loads(cleaned)
