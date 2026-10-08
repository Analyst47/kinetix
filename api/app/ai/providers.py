"""Model providers. Each one takes a system prompt, a user prompt and a JSON Schema and
returns a dict that is then validated by the caller. No provider can trigger any action:
its only output is data."""

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.config import get_settings
from app.errors import ApiError


class Provider(Protocol):
    name: str
    model: str
    # Shown to admins and researchers when the provider may keep or reuse what it is sent.
    data_notice: str | None

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
    data_notice: str | None = None

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
    data_notice: str | None = None

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


GEMINI_FREE_NOTICE = (
    "This server uses the free tier of the Gemini API. Google may use what Kinetix sends "
    "(finding details and source excerpts) to improve its products, and human reviewers may "
    "read it. Don't use it on findings from confidential engagements or unreleased "
    "vulnerabilities you aren't allowed to share."
)


def _gemini_schema(node: Any) -> Any:
    """Fit a schema to the JSON Schema subset Gemini accepts. Nullability stays in the type
    array; null is dropped from enums. The caller re-validates every field anyway."""
    if isinstance(node, dict):
        out = {k: _gemini_schema(v) for k, v in node.items()}
        if isinstance(out.get("enum"), list):
            out["enum"] = [v for v in out["enum"] if v is not None]
        return out
    if isinstance(node, list):
        return [_gemini_schema(v) for v in node]
    return node


@dataclass
class GeminiProvider:
    """Gemini via generateContent. responseJsonSchema constrains decoding to the schema."""

    api_key: str
    model: str
    base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    timeout: float = 60.0
    client: httpx.Client | None = None
    name: str = "gemini"
    data_notice: str | None = GEMINI_FREE_NOTICE
    # 503 (overloaded) and 500 are transient on the free tier; retry with backoff before failing.
    max_attempts: int = 4

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        client = self.client or httpx.Client(timeout=self.timeout)
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 4096,
                "responseMimeType": "application/json",
                "responseJsonSchema": _gemini_schema(schema),
            },
        }
        try:
            resp = None
            for attempt in range(self.max_attempts):
                try:
                    resp = client.post(
                        f"{self.base_url.rstrip('/')}/models/{self.model}:generateContent",
                        # Header, not ?key=, so the key never lands in proxy or access logs.
                        headers={
                            "x-goog-api-key": self.api_key,
                            "content-type": "application/json",
                        },
                        json=payload,
                    )
                except httpx.HTTPError as exc:
                    raise _unavailable("network error") from exc
                # Google returns 503 when the model is overloaded and 500 on a transient
                # internal error. Both clear on their own, so wait and try again.
                if resp.status_code in (500, 503) and attempt < self.max_attempts - 1:
                    time.sleep(2**attempt)
                    continue
                break
        finally:
            if self.client is None:
                client.close()
        assert resp is not None
        if resp.status_code == 429:
            raise ApiError(
                429,
                "ai_quota",
                "The Gemini API quota for this key is used up for now. Try again later.",
            )
        if resp.status_code == 503:
            raise ApiError(
                503,
                "ai_overloaded",
                "Gemini's free tier is overloaded right now. It usually clears in a minute or "
                "two — try the triage again shortly.",
            )
        if resp.status_code != 200:
            raise _unavailable(f"HTTP {resp.status_code}")
        body: Any = None
        try:
            body = resp.json()
            candidate = body["candidates"][0]
            if candidate.get("finishReason") not in (None, "STOP"):
                raise _unavailable(f"generation stopped ({candidate['finishReason'].lower()})")
            text = "".join(p.get("text", "") for p in candidate["content"]["parts"])
            data = json.loads(text)
        except ApiError:
            raise
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            if isinstance(body, dict) and (body.get("promptFeedback") or {}).get("blockReason"):
                raise _unavailable("the prompt was blocked by the provider") from exc
            raise _unavailable("output wasn't valid JSON") from exc
        if not isinstance(data, dict):
            raise _unavailable("output wasn't an object")
        return data


@dataclass
class MockProvider:
    """Deterministic stand-in for development and tests. It never calls a model and says so."""

    model: str = "mock"
    name: str = "mock"
    data_notice: str | None = None

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        from app.ai import mock

        return mock.respond(tool, user)


DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-5-5",
    # Free-tier eligible, fast, and good at reading code.
    "gemini": "gemini-3.5-flash",
}


def get_provider() -> Provider | None:
    s = get_settings()
    model = s.ai_model or DEFAULT_MODELS.get(s.ai_provider, "")
    if s.ai_provider == "anthropic" and s.ai_api_key:
        return AnthropicProvider(
            api_key=s.ai_api_key,
            model=model,
            base_url=s.ai_base_url or "https://api.anthropic.com",
            timeout=s.ai_timeout_seconds,
        )
    if s.ai_provider == "gemini" and s.ai_api_key:
        return GeminiProvider(
            api_key=s.ai_api_key,
            model=model,
            base_url=s.ai_base_url or "https://generativelanguage.googleapis.com/v1beta",
            timeout=s.ai_timeout_seconds,
            data_notice=None if s.ai_gemini_tier == "paid" else GEMINI_FREE_NOTICE,
        )
    if s.ai_provider == "openai_compatible" and s.ai_base_url and model:
        return OpenAICompatibleProvider(
            base_url=s.ai_base_url,
            model=model,
            api_key=s.ai_api_key,
            timeout=s.ai_timeout_seconds,
        )
    if s.ai_provider == "mock":
        return MockProvider()
    return None
