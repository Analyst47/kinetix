"""Model providers. Each one takes a system prompt, a user prompt and a JSON Schema and
returns a dict that is then validated by the caller. No provider can trigger any action:
its only output is data."""

import json
import re
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.config import get_settings
from app.errors import ApiError


class Provider(Protocol):
    name: str
    model: str

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]: ...


def _unavailable(detail: str) -> ApiError:
    return ApiError(502, "ai_unavailable", f"The AI provider didn't respond usefully: {detail}")


@dataclass
class AnthropicProvider:
    """Claude via the Messages API. A forced tool call makes the model return schema-shaped JSON."""

    api_key: str
    model: str
    base_url: str = "https://api.anthropic.com"
    timeout: float = 60.0
    client: httpx.Client | None = None
    name: str = "anthropic"

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        client = self.client or httpx.Client(timeout=self.timeout)
        try:
            resp = client.post(
                f"{self.base_url.rstrip('/')}/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 2048,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                    "tools": [
                        {
                            "name": tool,
                            "description": "Return your result in this exact structure.",
                            "input_schema": schema,
                        }
                    ],
                    "tool_choice": {"type": "tool", "name": tool},
                },
            )
        except httpx.HTTPError as exc:
            raise _unavailable("network error") from exc
        finally:
            if self.client is None:
                client.close()
        if resp.status_code != 200:
            raise _unavailable(f"HTTP {resp.status_code}")
        for block in resp.json().get("content", []):
            if block.get("type") == "tool_use" and isinstance(block.get("input"), dict):
                return block["input"]
        raise _unavailable("no structured result")


@dataclass
class OpenAICompatibleProvider:
    """Any OpenAI-style chat endpoint, e.g. a local Ollama server at http://localhost:11434/v1."""

    base_url: str
    model: str
    api_key: str | None = None
    timeout: float = 120.0
    client: httpx.Client | None = None
    name: str = "openai_compatible"

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        client = self.client or httpx.Client(timeout=self.timeout)
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        instruction = (
            "\n\nRespond with only a JSON object that matches this JSON Schema, and nothing else:\n"
            + json.dumps(schema)
        )
        try:
            resp = client.post(
                f"{self.base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system + instruction},
                        {"role": "user", "content": user},
                    ],
                },
            )
        except httpx.HTTPError as exc:
            raise _unavailable("network error") from exc
        finally:
            if self.client is None:
                client.close()
        if resp.status_code != 200:
            raise _unavailable(f"HTTP {resp.status_code}")
        try:
            content = resp.json()["choices"][0]["message"]["content"]
            match = re.search(r"\{.*\}", content, re.S)
            data = json.loads(match.group(0) if match else content)
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            raise _unavailable("output wasn't valid JSON") from exc
        if not isinstance(data, dict):
            raise _unavailable("output wasn't an object")
        return data


@dataclass
class MockProvider:
    """Deterministic stand-in for development and tests. It never calls a model and says so."""

    model: str = "mock"
    name: str = "mock"

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        from app.ai import mock

        return mock.respond(tool, user)


def get_provider() -> Provider | None:
    s = get_settings()
    if s.ai_provider == "anthropic" and s.ai_api_key:
        return AnthropicProvider(
            api_key=s.ai_api_key,
            model=s.ai_model,
            base_url=s.ai_base_url or "https://api.anthropic.com",
            timeout=s.ai_timeout_seconds,
        )
    if s.ai_provider == "openai_compatible" and s.ai_base_url:
        return OpenAICompatibleProvider(
            base_url=s.ai_base_url,
            model=s.ai_model,
            api_key=s.ai_api_key,
            timeout=s.ai_timeout_seconds,
        )
    if s.ai_provider == "mock":
        return MockProvider()
    return None
