"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, inputClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import type { AiStatus } from "@/lib/types";

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic Claude",
  gemini: "Google Gemini",
};
const MODEL_PLACEHOLDER: Record<string, string> = {
  anthropic: "claude-sonnet-5-5 (default)",
  gemini: "gemini-3.5-flash (default)",
};

/** Lets a user supply their own provider API key for the current session only. */
export function AiKeyForm({ org, status }: { org: string; status: AiStatus }) {
  const router = useRouter();
  const providers = status.byok_providers.length ? status.byok_providers : ["anthropic", "gemini"];
  const [provider, setProvider] = useState(providers[0]!);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await call("PUT", `/orgs/${org}/ai/key`, {
        provider,
        api_key: apiKey.trim(),
        model: model.trim() || null,
      });
      setApiKey("");
      setModel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the key. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await call("DELETE", `/orgs/${org}/ai/key`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the key.");
    } finally {
      setPending(false);
    }
  }

  if (status.key_set) {
    return (
      <div className="flex flex-col gap-3">
        <div className="border-ok/40 bg-ok/5 flex items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]">
          <ShieldCheck className="text-ok size-4 shrink-0" />
          <span>
            Your <strong>{PROVIDER_LABEL[status.key_provider ?? ""] ?? status.key_provider}</strong>{" "}
            key is active for this session
            {status.key_model ? (
              <>
                {" "}
                (<span className="mono">{status.key_model}</span>)
              </>
            ) : null}
            . It&apos;s stored only until you log out and is never saved to our database.
          </span>
        </div>
        <div>
          <Button variant="danger" disabled={pending} onClick={remove}>
            Remove key
          </Button>
        </div>
        {error ? <p className="text-crit text-[13px]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Provider" htmlFor="ai-provider">
        <select
          id="ai-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className={inputClass}
        >
          {providers.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABEL[p] ?? p}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="API key"
        htmlFor="ai-key"
        hint="Held only for your current session, encrypted, never written to our database, and cleared when you log out."
      >
        <input
          id="ai-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === "gemini" ? "AIza…" : "sk-ant-…"}
          className={`${inputClass} mono`}
        />
      </Field>
      <Field label="Model (optional)" htmlFor="ai-model">
        <input
          id="ai-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={MODEL_PLACEHOLDER[provider] ?? "default"}
          className={`${inputClass} mono`}
        />
      </Field>
      {provider === "gemini" ? (
        <p className="text-muted text-xs">
          On Gemini&apos;s free tier, Google may use what&apos;s sent to improve its products.
          Don&apos;t use it on confidential findings.
        </p>
      ) : (
        <p className="text-muted text-xs">
          Requests bill to your own Anthropic account at usage-based rates.
        </p>
      )}
      <div>
        <Button variant="primary" disabled={pending || apiKey.trim().length < 8} onClick={save}>
          <KeyRound aria-hidden />
          {pending ? "Saving…" : "Save key for this session"}
        </Button>
      </div>
      {error ? <p className="text-crit text-[13px]">{error}</p> : null}
    </div>
  );
}
