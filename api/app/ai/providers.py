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
    # Token usage from the most recent complete() call, when the provider reports it:
    # {"input_tokens": int, "output_tokens": int}. None when unknown.
    last_usage: dict[str, int] | None

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]: ...


def _unavailable(detail: str) -> ApiError:
    return ApiError(502, "ai_unavailable", f"The AI provider didn't respond usefully: {detail}")


# Transient upstream statuses worth retrying: rate limits (429), server errors (500),
# and the provider-overloaded signals (503, and Anthropic's 529).
_RETRY_STATUS = {429, 500, 503, 529}


def _transient_error(status: int) -> ApiError:
    """Map a persistent transient status to a stable error code the triage loop understands."""
    if status == 429:
        return ApiError(
            429, "rate_limited", "The AI provider is rate-limiting requests. Try again shortly."
        )
    return ApiError(
        503,
        "ai_overloaded",
        "The AI provider is overloaded right now. It usually clears in a minute or two — "
        "try again shortly.",
    )


@dataclass
class AnthropicProvider:
    """Claude via the Messages API. The model returns its result through a single tool whose
    input schema is the result schema. Current Claude models reject a forced tool_choice, so
    the request uses "auto" and the system prompt says to call it; the caller validates the
    input like any other model output, and a reply without the tool call is an error."""

    api_key: str
    model: str
    base_url: str = "https://api.anthropic.com"
    timeout: float = 60.0
    client: httpx.Client | None = None
    name: str = "anthropic"
    data_notice: str | None = None
    max_tokens: int = 4096
    max_attempts: int = 4
    # Reasoning effort (low | medium | high); None sends no effort parameter.
    effort: str | None = None
    last_usage: dict[str, int] | None = None

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        self.last_usage = None
        client = self.client or httpx.Client(timeout=self.timeout)
        body: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "tools": [
                {
                    "name": tool,
                    "description": "Record your result in this exact structure. Call this "
                    "tool exactly once; do not answer in plain text.",
                    "input_schema": schema,
                }
            ],
            "tool_choice": {"type": "auto"},
        }
        if self.effort:
            body["output_config"] = {"effort": self.effort}
        try:
            resp = None
            for attempt in range(self.max_attempts):
                try:
                    resp = client.post(
                        f"{self.base_url.rstrip('/')}/v1/messages",
                        headers={
                            "x-api-key": self.api_key,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json=body,
                    )
                except httpx.HTTPError as exc:
                    raise _unavailable("network error") from exc
                if resp.status_code in _RETRY_STATUS and attempt < self.max_attempts - 1:
                    time.sleep(2**attempt)
                    continue
                break
        finally:
            if self.client is None:
                client.close()
        assert resp is not None
        if resp.status_code in _RETRY_STATUS:
            raise _transient_error(resp.status_code)
        if resp.status_code != 200:
            raise _unavailable(f"HTTP {resp.status_code}")
        payload = resp.json()
        usage = payload.get("usage") or {}
        if isinstance(usage, dict):
            self.last_usage = {
                "input_tokens": int(usage.get("input_tokens", 0) or 0),
                "output_tokens": int(usage.get("output_tokens", 0) or 0),
            }
        for block in payload.get("content", []):
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
    last_usage: dict[str, int] | None = None

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        self.last_usage = None
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
        payload = resp.json()
        usage = payload.get("usage") or {}
        if isinstance(usage, dict) and usage:
            self.last_usage = {
                "input_tokens": int(usage.get("prompt_tokens", 0) or 0),
                "output_tokens": int(usage.get("completion_tokens", 0) or 0),
            }
        try:
            content = payload["choices"][0]["message"]["content"]
            match = re.search(r"\{.*\}", content, re.S)
            data = json.loads(match.group(0) if match else content)
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            raise _unavailable("output wasn't valid JSON") from exc
        if not isinstance(data, dict):
            raise _unavailable("output wasn't an object")
        return data


GEMINI_FREE_NOTICE = (
    "This server uses the free tier of the Gemini API. Google may use what KinetixZero sends "
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
    max_tokens: int = 4096
    # 503 (overloaded) and 500 are transient on the free tier; retry with backoff before failing.
    max_attempts: int = 4
    last_usage: dict[str, int] | None = None

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        self.last_usage = None
        client = self.client or httpx.Client(timeout=self.timeout)
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": self.max_tokens,
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
            meta = body.get("usageMetadata") or {}
            if isinstance(meta, dict) and meta:
                self.last_usage = {
                    "input_tokens": int(meta.get("promptTokenCount", 0) or 0),
                    "output_tokens": int(meta.get("candidatesTokenCount", 0) or 0),
                }
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
    last_usage: dict[str, int] | None = None

    def complete(
        self, *, system: str, user: str, schema: dict[str, Any], tool: str
    ) -> dict[str, Any]:
        from app.ai import mock

        self.last_usage = {"input_tokens": 0, "output_tokens": 0}
        return mock.respond(tool, user)


DEFAULT_MODELS = {
    # Cheapest current Claude ($0.10 / $0.50 per million tokens); one triage run is ~$0.001-0.003.
    "anthropic": "claude-haiku-5-5",
    # Free-tier eligible, fast, and good at reading code.
    "gemini": "gemini-3.5-flash",
}


def build_provider(
    provider: str,
    api_key: str | None,
    model: str | None,
    *,
    base_url: str | None = None,
    gemini_tier: str = "free",
) -> Provider | None:
    """Construct a provider from explicit parameters (the server-configured managed provider)."""
    s = get_settings()
    model = model or DEFAULT_MODELS.get(provider, "")
    if provider == "anthropic" and api_key:
        return AnthropicProvider(
            api_key=api_key,
            model=model,
            base_url=base_url or "https://api.anthropic.com",
            timeout=s.ai_timeout_seconds,
            max_tokens=s.ai_max_output_tokens,
            max_attempts=max(1, s.ai_max_retries),
            effort=(s.ai_effort or "").strip() or None,
        )
    if provider == "gemini" and api_key:
        return GeminiProvider(
            api_key=api_key,
            model=model,
            base_url=base_url or "https://generativelanguage.googleapis.com/v1beta",
            timeout=s.ai_timeout_seconds,
            max_tokens=s.ai_max_output_tokens,
            max_attempts=max(1, s.ai_max_retries),
            data_notice=None if gemini_tier == "paid" else GEMINI_FREE_NOTICE,
        )
    if provider == "openai_compatible" and base_url and model:
        return OpenAICompatibleProvider(
            base_url=base_url, model=model, api_key=api_key, timeout=s.ai_timeout_seconds
        )
    if provider == "mock":
        return MockProvider()
    return None


def get_provider() -> Provider | None:
    """The server-configured managed provider, if one is configured with usable credentials."""
    s = get_settings()
    return build_provider(
        s.ai_provider,
        s.ai_api_key,
        s.ai_model,
        base_url=s.ai_base_url,
        gemini_tier=s.ai_gemini_tier,
    )
