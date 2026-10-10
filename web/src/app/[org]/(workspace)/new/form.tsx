"use client";

import clsx from "clsx";
import {
  Archive,
  ArrowRight,
  Bug,
  Building2,
  Check,
  ChevronDown,
  FileSignature,
  FlaskConical,
  Globe,
  Link2,
  LoaderCircle,
  Lock,
  Pencil,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { useShell } from "@/components/shell-context";
import { Button, ButtonLink, FormAlert, Kbd, inputClass, textareaClass } from "@/components/ui";
import { ApiError, call } from "@/lib/client";
import { AUTHORIZATION_LABEL } from "@/lib/format";
import type { Project, Role } from "@/lib/types";

import { useCanReadClipboard, useModKey, useToday } from "./hooks";
import { Preview } from "./preview";
import {
  AUTH_HINT,
  AUTH_TYPES,
  REVIEWS,
  REVIEW_LABEL,
  autoSlug,
  checkRepoUrl,
  cleanSlugInput,
  inScopeText,
  isHttpsLink,
  nameSuggestions,
  needsProgramLink,
  outScopeText,
  reviewDate,
  slugProblem,
  type AuthType,
  type InScope,
  type OutScope,
  type Repo,
  type Review,
} from "./repo";
import { GitHubMark, RepoField, type UrlSource } from "./repo-field";
import { Combobox, Select, type Option } from "./select";
import { ControlLabel, Step, type StepStatus } from "./steps";

// Shown to the researcher before they attest. The API records its own copy of this text.
const ATTESTATION =
  "I am authorized to analyze this target within the scope below. I will not test systems or components that are out of scope, and I will report confirmed vulnerabilities through coordinated disclosure.";

/** Roles with the API's project:create permission. */
const CAN_CREATE: Role[] = ["owner", "admin", "researcher"];

const AUTH_ICON = {
  open_source: Globe,
  bug_bounty: Bug,
  vendor_authorization: FileSignature,
  personal_lab: FlaskConical,
  organization_owned: Building2,
} as const;

const AUTH_OPTIONS: Option<AuthType>[] = AUTH_TYPES.map((t) => ({
  value: t,
  label: AUTHORIZATION_LABEL[t] ?? t,
  description: AUTH_HINT[t],
  icon: AUTH_ICON[t],
}));

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const CUSTOM_HINT = "Write your own statement";

type Phase = "project" | "repo" | "open";

const PHASE_LABEL: Record<Phase, string> = {
  project: "Creating project…",
  repo: "Adding repository…",
  open: "Opening scans…",
};

export function NewProjectForm({ org, taken: existing }: { org: string; taken: string[] }) {
  const router = useRouter();
  const { user, org: membership } = useShell();
  const canCreate = CAN_CREATE.includes(membership.role);
  const today = useToday();
  const mod = useModKey();
  const canPaste = useCanReadClipboard();
  const urlRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<"repo" | "none">("repo");
  // The last usable repository: drives suggestions and presets, so they don't flicker away
  // while the link is being edited, and keeps the later steps open once they've appeared.
  const [lastRepo, setLastRepo] = useState<Repo | null>(null);
  // A suggestion index, or the text the researcher typed.
  const [nameChoice, setNameChoice] = useState<number | string>(0);
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const [authType, setAuthType] = useState<AuthType>("open_source");
  const [link, setLink] = useState("");
  const [inChoice, setInChoice] = useState<InScope>("source");
  const [inCustom, setInCustom] = useState("");
  const [outChoice, setOutChoice] = useState<OutScope>("hosted");
  const [outCustom, setOutCustom] = useState("");
  const [review, setReview] = useState<Review>("90d");
  const [attest, setAttest] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [extraTaken, setExtraTaken] = useState<string[]>([]);
  const [pending, setPending] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Project | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);

  // ── Derived state ──────────────────────────────────────────────────────────
  const check = checkRepoUrl(url);
  const repo = mode === "repo" && check.state === "valid" ? check.repo : null;
  const basis = mode === "repo" ? (repo ?? lastRepo) : null;
  const revealed = mode === "none" || lastRepo !== null;
  const fieldsLocked = created !== null || !canCreate;

  const taken = useMemo(() => new Set([...existing, ...extraTaken]), [existing, extraTaken]);
  const suggestions = basis ? nameSuggestions(basis) : [];
  const name =
    typeof nameChoice === "number" ? (suggestions[nameChoice] ?? suggestions[0] ?? "") : nameChoice;
  const trimmedName = name.trim();
  const nameError = !trimmedName
    ? "Give the project a name."
    : trimmedName.length > 120
      ? "Keep the name to 120 characters or fewer."
      : null;
  const autoBase = autoSlug(name, basis?.name ?? "", new Set());
  const auto = autoSlug(name, basis?.name ?? "", taken);
  const slug = customSlug ?? auto;
  const slugError = slugProblem(slug, taken);

  const showLink = needsProgramLink(authType) || (authType === "open_source" && mode === "none");
  const linkValue = link.trim();
  const linkError =
    showLink && linkValue
      ? !isHttpsLink(linkValue)
        ? "Use an https:// link."
        : linkValue.length > 500
          ? "Keep the link to 500 characters or fewer."
          : null
      : null;
  const reference =
    authType === "open_source" && repo ? repo.url : showLink && linkValue && !linkError ? linkValue : null;

  const inText = inChoice === "custom" ? inCustom : inScopeText(inChoice, basis);
  const outText = outChoice === "custom" ? outCustom : outScopeText(outChoice, basis);
  const inError =
    inText.trim().length < 3
      ? "Describe what's in scope (at least 3 characters)."
      : inText.length > 4000
        ? "Keep it under 4,000 characters."
        : null;
  const outError = outText.length > 4000 ? "Keep it under 4,000 characters." : null;
  const expires = today ? reviewDate(review, today) : null;

  const flags = [
    mode === "none" || repo !== null,
    revealed && !nameError && !slugError,
    revealed && !linkError,
    revealed && !inError && !outError,
    revealed && attest,
  ];
  const firstOpen = flags.indexOf(false);
  const statusOf = (i: number): StepStatus => (flags[i] ? "done" : i === firstOpen ? "current" : "upcoming");
  const readyCount = flags.filter(Boolean).length;
  const allReady = canCreate && flags.every(Boolean);

  const missing = !canCreate
    ? "Your role can't create projects."
    : !flags[0]
      ? "Add a repository link, or continue without one."
      : nameError
        ? nameError
        : slugError
          ? `URL name: ${slugError}`
          : linkError
            ? linkError
            : inError
              ? inError
              : outError
                ? outError
                : !attest
                  ? "Confirm you're authorized to analyze this target."
                  : null;

  // ── Handlers ───────────────────────────────────────────────────────────────
  function changeUrl(next: string, source: UrlSource) {
    let value = next;
    let tidy: string | null = null;
    if (source === "paste") {
      const pasted = checkRepoUrl(next);
      if (pasted.state === "invalid" && pasted.fix) {
        value = pasted.fix;
        tidy = "Cleaned up the pasted link";
      }
    }
    setUrl(value);
    setNote(tidy);
    setUrlTouched(source === "paste" || source === "example" || source === "fix");
    const result = checkRepoUrl(value);
    if (result.state === "valid") {
      setLastRepo(result.repo);
      setMode("repo");
    }
    if (source === "clear" || source === "example" || source === "fix") urlRef.current?.focus();
  }

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) changeUrl(text, "paste");
    } catch {
      // Permission refused: the field is focused, so a normal paste still works.
    }
    urlRef.current?.focus();
  }

  function chooseIn(next: InScope) {
    if (next === "custom" && inChoice !== "custom" && !inCustom.trim()) setInCustom(inText);
    setInChoice(next);
  }

  function chooseOut(next: OutScope) {
    if (next === "custom" && outChoice !== "custom" && !outCustom.trim()) setOutCustom(outText);
    setOutChoice(next);
  }

  function openProject(project: Project) {
    setPending("open");
    router.push(`/${org}/${project.slug}/scans`);
  }

  async function addRepository(project: Project) {
    if (!repo) return;
    setPending("repo");
    setRepoError(null);
    try {
      await call("POST", `/orgs/${org}/projects/${project.slug}/targets/git`, { url: repo.url, scan: true });
    } catch (err) {
      setPending(null);
      setRepoError(err instanceof ApiError ? err.message : "Couldn't add the repository. Try again.");
      return;
    }
    openProject(project);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (created) {
      if (repo) await addRepository(created);
      return;
    }
    if (!allReady) return;
    setPending("project");
    setError(null);
    setRepoError(null);
    let project: Project;
    try {
      project = await call<Project>("POST", `/orgs/${org}/projects`, {
        name: trimmedName,
        slug,
        authorization_type: authType,
        in_scope: inText.trim(),
        out_of_scope: outText.trim(),
        authorization_reference: reference,
        authorization_expires_at: reviewDate(review, new Date())?.toISOString() ?? null,
        attest,
      });
    } catch (err) {
      setPending(null);
      if (err instanceof ApiError && err.code === "slug_taken") {
        const next = autoSlug(name, basis?.name ?? "", new Set([...taken, slug]));
        setExtraTaken((t) => [...t, slug]);
        setError(
          customSlug === null
            ? `/${org}/${slug} was just taken, so the URL name is now /${org}/${next}. Create again to continue.`
            : "A project in this workspace already uses that URL name. Choose another.",
        );
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't create the project. Try again.");
      }
      return;
    }
    setCreated(project);
    if (mode === "repo" && repo) await addRepository(project);
    else openProject(project);
  }

  function onFormKey(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      e.currentTarget.requestSubmit();
      return;
    }
    // Enter in a one-line field never submits by accident; the button (or Ctrl/⌘+Enter) does.
    const target = e.target;
    if (target instanceof HTMLInputElement && target.type !== "checkbox") e.preventDefault();
  }

  // ── Option lists ───────────────────────────────────────────────────────────
  const inOptions: Option<InScope>[] = [
    { value: "source", label: inScopeText("source", basis) },
    { value: "source_deps", label: inScopeText("source_deps", basis) },
    { value: "custom", label: "Custom…", description: CUSTOM_HINT, icon: Pencil },
  ];
  const outOptions: Option<OutScope>[] = [
    { value: "hosted", label: outScopeText("hosted", basis) },
    { value: "third_party", label: outScopeText("third_party", basis) },
    { value: "outside", label: outScopeText("outside", basis) },
    { value: "custom", label: "Custom…", description: CUSTOM_HINT, icon: Pencil },
  ];
  const reviewOptions: Option<Review>[] = REVIEWS.map((r) => {
    const date = today ? reviewDate(r, today) : null;
    return {
      value: r,
      label: REVIEW_LABEL[r],
      description:
        r === "none"
          ? "Scans stay allowed until you set a date"
          : date
            ? `${dateFmt.format(date)}${r === "90d" ? " · recommended" : ""}`
            : undefined,
    };
  });

  const primaryLabel = created
    ? "Add repository & start scan"
    : mode === "repo"
      ? "Create project & start scan"
      : "Create project";
  const submitDisabled = pending !== null || (created ? !repo : !allReady);
  const stagger = (i: number) => ({ animationDelay: `${i * 70}ms` });

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={onFormKey}
      aria-label="New project"
      className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]"
    >
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        {!canCreate ? (
          <div className="border-rule bg-raised mb-8 flex items-start gap-3 rounded-2xl border p-4">
            <span className="border-rule bg-sunken grid size-9 shrink-0 place-items-center rounded-full border">
              <Lock className="size-4" aria-hidden />
            </span>
            <div>
              <p className="font-medium">Your role can&apos;t create projects</p>
              <p className="text-muted text-[13px]">
                Researchers, admins and owners can. Ask an owner of {membership.name} to change your role.
              </p>
            </div>
          </div>
        ) : null}

        <Step
          n={1}
          id="step-repo"
          title="Repository"
          hint="Paste a public repository link. KinetixZero suggests everything else."
          status={statusOf(0)}
        >
          {mode === "repo" ? (
            <RepoField
              id="p-repo"
              label="Public repository URL"
              value={url}
              check={check}
              touched={urlTouched}
              note={note}
              canPaste={canPaste}
              disabled={!canCreate || pending !== null}
              inputRef={urlRef}
              onValue={changeUrl}
              onBlur={() => setUrlTouched(url.trim() !== "")}
              onEnter={() => nameRef.current?.focus()}
              onPasteButton={pasteFromClipboard}
              onSkip={created ? undefined : () => setMode("none")}
            />
          ) : (
            <div className="border-rule-strong/70 bg-raised kx-fade-up flex flex-wrap items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5">
              <span className="border-rule bg-sunken grid size-10 shrink-0 place-items-center rounded-full border">
                <Archive className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">No repository for now</p>
                <p className="text-muted text-[13px]">
                  Create the project, then upload a .zip or .tar.gz of the source from its Scans page.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setMode("repo")} disabled={pending !== null}>
                <GitHubMark className="size-4" />
                Add a repository instead
              </Button>
            </div>
          )}
        </Step>

        <fieldset disabled={fieldsLocked} className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Project details</legend>
          <Step
            n={2}
            id="step-name"
            title="Name"
            hint={
              revealed
                ? suggestions.length
                  ? "Pick a suggestion or type your own."
                  : "What should this project be called?"
                : "Suggested from the repository. Pick one or type your own."
            }
            status={statusOf(1)}
            delay={110}
            locked={!revealed}
          >
            {revealed ? (
              <div className="kx-fade-up" style={stagger(0)}>
                <Combobox
                  id="p-name"
                  labelId="step-name"
                  value={name}
                  suggestions={suggestions}
                  onType={(v) => setNameChoice(v)}
                  onPick={(i) => setNameChoice(i)}
                  placeholder={mode === "none" ? "e.g. Payments service" : "Project name"}
                  inputRef={nameRef}
                  maxLength={120}
                  invalid={typeof nameChoice === "string" && nameError !== null}
                  describedBy="p-name-help"
                />
                {suggestions.length > 1 ? (
                  <div role="group" aria-label="Name suggestions" className="mt-3 flex flex-wrap gap-2">
                    {suggestions.map((s, i) => {
                      const on = s === name;
                      return (
                        <button
                          key={`${basis?.url}-${s}`}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setNameChoice(i)}
                          style={stagger(i)}
                          className={clsx(
                            "kx-fade-up inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
                            on
                              ? "border-brand bg-brand text-on-brand"
                              : "border-rule bg-raised text-ink hover:border-ink",
                          )}
                        >
                          {on ? <Check className="size-3.5 shrink-0" strokeWidth={2.75} aria-hidden /> : null}
                          <span className="truncate">{s}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div id="p-name-help" className="mt-3 text-[13px]">
                  {typeof nameChoice === "string" && nameError ? (
                    <p className="text-crit mb-2 text-xs">{nameError}</p>
                  ) : null}
                  {customSlug === null ? (
                    <p className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Lives at</span>
                      <span className="font-mono text-[12.5px]">
                        /{org}/
                        <span
                          key={typeof nameChoice === "string" ? "typed" : slug}
                          className="text-ink kx-fade-up inline-block"
                        >
                          {slug}
                        </span>
                      </span>
                      {autoBase !== auto ? <span className="text-xs">(/{autoBase} is taken)</span> : null}
                      <button
                        type="button"
                        onClick={() => setCustomSlug(slug)}
                        className="text-ink decoration-rule-strong hover:decoration-ink inline-flex items-center gap-1 underline underline-offset-4 transition-colors"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        Edit URL
                      </button>
                    </p>
                  ) : (
                    <div className="kx-fade-up">
                      <ControlLabel htmlFor="p-slug">URL name</ControlLabel>
                      <div
                        className={clsx(
                          "bg-raised flex h-11 items-center rounded-xl border transition-colors",
                          slugError
                            ? "border-crit/60 focus-within:border-crit"
                            : "border-rule-strong/70 hover:border-rule-strong focus-within:border-ink",
                        )}
                      >
                        <span className="text-muted pl-3.5 font-mono text-[12.5px] whitespace-nowrap">
                          /{org}/
                        </span>
                        <input
                          id="p-slug"
                          autoFocus
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={64}
                          aria-invalid={slugError ? true : undefined}
                          aria-describedby="p-slug-help"
                          value={customSlug}
                          onChange={(e) => setCustomSlug(cleanSlugInput(e.target.value))}
                          onBlur={() => setCustomSlug((s) => (s === null ? s : s.replace(/-+$/, "")))}
                          className="text-ink h-full min-w-0 flex-1 bg-transparent pr-2 font-mono text-[12.5px] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setCustomSlug(null)}
                          className="text-muted hover:text-ink hover:bg-ink/[0.06] mr-1.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors"
                        >
                          <RotateCcw className="size-3.5" aria-hidden />
                          Automatic
                        </button>
                      </div>
                      <p
                        id="p-slug-help"
                        className={clsx("mt-1.5 text-xs", slugError ? "text-crit" : "text-muted")}
                      >
                        {slugError ?? "Lowercase letters, numbers and hyphens."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </Step>

          <Step
            n={3}
            id="step-auth"
            title="Authorization"
            hint={
              revealed
                ? "Why you're allowed to analyze this target. It's stored with the project and shown on every report."
                : "Open-source by default for a public repository."
            }
            status={statusOf(2)}
            delay={220}
            locked={!revealed}
          >
            {revealed ? (
              <div className="kx-fade-up" style={stagger(1)}>
                <ControlLabel id="auth-label">Basis</ControlLabel>
                <Select
                  id="p-auth"
                  labelId="auth-label"
                  value={authType}
                  options={AUTH_OPTIONS}
                  onChange={setAuthType}
                />
                {showLink ? (
                  <div key={authType} className="kx-fade-up mt-4">
                    <ControlLabel
                      htmlFor="p-link"
                      aside={<span className="text-muted text-xs">Optional</span>}
                    >
                      {needsProgramLink(authType) ? "Program or permission link" : "Project link"}
                    </ControlLabel>
                    <div className="relative">
                      <Link2
                        className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                        aria-hidden
                      />
                      <input
                        id="p-link"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={500}
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="https://"
                        aria-invalid={linkError ? true : undefined}
                        aria-describedby="p-link-help"
                        className={clsx(
                          inputClass,
                          "h-11 rounded-xl pl-10",
                          linkError && "border-crit/60 focus-visible:border-crit",
                        )}
                      />
                    </div>
                    <p
                      id="p-link-help"
                      className={clsx("mt-1.5 text-xs", linkError ? "text-crit" : "text-muted")}
                    >
                      {linkError ??
                        (needsProgramLink(authType)
                          ? "The program page or written permission, so a reviewer can check it later."
                          : "Where the project's source is published.")}
                    </p>
                  </div>
                ) : null}
                {authType === "open_source" && repo ? (
                  <p className="text-muted mt-3 flex items-center gap-1.5 text-[13px]">
                    <Link2 className="size-3.5 shrink-0" aria-hidden />
                    The repository link is recorded as the reference.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Step>

          <Step
            n={4}
            id="step-scope"
            title="Scope"
            hint={
              revealed
                ? "The boundary you'll stay within. Presets are written from the repository."
                : "Pick in scope, out of scope and a review date from presets."
            }
            status={statusOf(3)}
            delay={330}
            locked={!revealed}
          >
            {revealed ? (
              <div className="kx-fade-up flex flex-col gap-5" style={stagger(2)}>
                <div>
                  <ControlLabel id="in-label">In scope</ControlLabel>
                  <Select
                    id="p-in"
                    labelId="in-label"
                    value={inChoice}
                    options={inOptions}
                    onChange={chooseIn}
                  />
                  {inChoice === "custom" ? (
                    <div className="kx-fade-up mt-2.5">
                      <textarea
                        id="p-in-custom"
                        aria-labelledby="in-label"
                        aria-describedby="p-in-help"
                        autoFocus
                        rows={3}
                        maxLength={4000}
                        value={inCustom}
                        onChange={(e) => setInCustom(e.target.value)}
                        placeholder="Name the exact repository, version, package or host."
                        className={clsx(textareaClass, "rounded-xl px-3.5 py-2.5 leading-[21px]")}
                      />
                      <p
                        id="p-in-help"
                        className={clsx(
                          "mt-1.5 text-xs",
                          inCustom.trim() && inError ? "text-crit" : "text-muted",
                        )}
                      >
                        {inCustom.trim() && inError
                          ? inError
                          : "Name the exact repository, version, package or host."}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div>
                  <ControlLabel id="out-label">Out of scope</ControlLabel>
                  <Select
                    id="p-out"
                    labelId="out-label"
                    value={outChoice}
                    options={outOptions}
                    onChange={chooseOut}
                  />
                  {outChoice === "custom" ? (
                    <div className="kx-fade-up mt-2.5">
                      <textarea
                        id="p-out-custom"
                        aria-labelledby="out-label"
                        autoFocus
                        rows={2}
                        maxLength={4000}
                        value={outCustom}
                        onChange={(e) => setOutCustom(e.target.value)}
                        placeholder="What you will not touch."
                        className={clsx(textareaClass, "rounded-xl px-3.5 py-2.5 leading-[21px]")}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="sm:max-w-[380px]">
                  <ControlLabel id="review-label">Review by</ControlLabel>
                  <Select
                    id="p-review"
                    labelId="review-label"
                    value={review}
                    options={reviewOptions}
                    onChange={setReview}
                  />
                  <p className="text-muted mt-1.5 text-xs">
                    After this date, KinetixZero pauses new scans until you renew.
                  </p>
                </div>
              </div>
            ) : null}
          </Step>

          <Step
            n={5}
            id="step-confirm"
            title="Confirm"
            hint={
              revealed
                ? "The one thing KinetixZero can't fill in for you."
                : "One checkbox to attest you're authorized."
            }
            status={statusOf(4)}
            delay={440}
            locked={!revealed}
            last
          >
            {revealed ? (
              <div
                className={clsx(
                  "kx-fade-up bg-raised rounded-2xl border transition-[border-color,box-shadow] duration-200",
                  attest
                    ? "border-ink shadow-[0_0_0_3px_color-mix(in_srgb,var(--ink)_6%,transparent)]"
                    : "border-rule-strong/70",
                )}
                style={stagger(3)}
              >
                <label htmlFor="p-attest" className="flex cursor-pointer items-start gap-3.5 p-4">
                  <span className="relative mt-0.5 grid size-[22px] shrink-0 place-items-center">
                    <input
                      id="p-attest"
                      type="checkbox"
                      checked={attest}
                      onChange={(e) => setAttest(e.target.checked)}
                      aria-describedby="p-attest-full"
                      className="border-rule-strong bg-raised checked:border-brand checked:bg-brand hover:border-ink absolute inset-0 size-full cursor-pointer appearance-none rounded-md border-[1.5px] transition-colors disabled:cursor-not-allowed"
                    />
                    {attest ? (
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        className="text-on-brand pointer-events-none relative size-3.5"
                        fill="none"
                      >
                        <path
                          d="M3.5 8.5 6.5 11.5 12.5 4.5"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          pathLength={1}
                          strokeDasharray="1"
                          strokeDashoffset="1"
                          className="animate-[kx-draw_0.28s_ease-out_forwards]"
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[14.5px] leading-[22px] font-medium">
                      I&apos;m authorized to analyze this target, within this scope.
                    </span>
                    <span className="text-muted text-[13px] leading-5">
                      Recorded with your name and the time, and shown on every report this project produces.
                    </span>
                  </span>
                </label>
                <div className="border-rule border-t px-4">
                  <button
                    type="button"
                    aria-expanded={statementOpen}
                    aria-controls="p-attest-full"
                    onClick={() => setStatementOpen((o) => !o)}
                    className="text-muted hover:text-ink flex w-full items-center gap-1.5 py-2.5 text-[12.5px] transition-colors"
                  >
                    <ShieldCheck className="size-3.5" aria-hidden />
                    {statementOpen ? "Hide the full statement" : "Read the full statement"}
                    <ChevronDown
                      aria-hidden
                      className={clsx(
                        "ml-auto size-3.5 transition-transform duration-200",
                        statementOpen && "rotate-180",
                      )}
                    />
                  </button>
                  <div
                    className={clsx(
                      "grid transition-[grid-template-rows] duration-300 ease-out",
                      statementOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">
                      <blockquote
                        id="p-attest-full"
                        inert={!statementOpen}
                        className="border-ink text-ink mb-4 border-l-2 pl-3.5 text-[13px] leading-5"
                      >
                        {ATTESTATION}
                      </blockquote>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </Step>
        </fieldset>
      </div>

      <aside
        aria-label="What will be recorded"
        className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <Preview
          org={org}
          name={name}
          slug={slug}
          mode={mode}
          repo={repo}
          revealed={revealed}
          authType={authType}
          reference={reference}
          inScope={inText}
          outScope={outText}
          expires={expires}
          noExpiry={review === "none"}
          today={today}
          attest={attest}
          userName={user.name}
          ready={readyCount}
          total={flags.length}
          typed={{
            name: typeof nameChoice === "string",
            inScope: inChoice === "custom",
            outScope: outChoice === "custom",
          }}
        />
      </aside>

      <div className="border-rule bg-paper/85 supports-[backdrop-filter]:bg-paper/70 sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 border-t px-4 py-3 backdrop-blur-xl md:-mx-6 md:px-6 lg:bottom-4 lg:col-start-1 lg:row-start-2 lg:mx-0 lg:rounded-2xl lg:border lg:px-4 lg:shadow-[0_18px_50px_-24px_rgb(0_0_0/0.4)]">
        {error ? <FormAlert>{error}</FormAlert> : null}
        {created && repoError ? (
          <div
            role="alert"
            className="border-rule bg-raised kx-fade-up flex items-start gap-3 rounded-xl border p-3.5"
          >
            <span className="bg-brand text-on-brand grid size-7 shrink-0 place-items-center rounded-full">
              <Check className="size-4" strokeWidth={2.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">
                &ldquo;{created.name}&rdquo; was created, but the repository wasn&apos;t added.
              </p>
              <p className="text-crit mt-0.5 text-[13px]">{repoError}</p>
              <p className="text-muted mt-1 text-[13px]">
                Fix the link above and try again, or{" "}
                <Link
                  href={`/${org}/${created.slug}/scans`}
                  className="text-ink underline underline-offset-4"
                >
                  open the project
                </Link>{" "}
                and add a repository or archive from its Scans page.
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-muted mr-auto flex min-w-0 items-center gap-2 text-[13px]" aria-live="polite">
            {pending ? (
              <>
                <LoaderCircle className="text-ink size-4 shrink-0 animate-spin" aria-hidden />
                <span className="text-ink">{PHASE_LABEL[pending]}</span>
              </>
            ) : created ? (
              <span>Project created. Add the repository to start the scan.</span>
            ) : allReady ? (
              <>
                <span aria-hidden className="relative inline-flex size-1.5 shrink-0">
                  <span className="kx-pulse-ring bg-ink absolute inset-0 rounded-full" />
                  <span className="bg-ink relative size-1.5 rounded-full" />
                </span>
                <span className="text-ink">Ready</span>
                <span className="hidden items-center gap-1 sm:inline-flex">
                  <Kbd>{mod}</Kbd>
                  <Kbd>Enter</Kbd>
                </span>
              </>
            ) : (
              <span className="truncate">{missing}</span>
            )}
          </p>
          {created ? (
            <ButtonLink variant="ghost" href={`/${org}/${created.slug}/scans`}>
              Open project
            </ButtonLink>
          ) : (
            <span className="hidden sm:contents">
              <ButtonLink variant="ghost" href={`/${org}`}>
                Cancel
              </ButtonLink>
            </span>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={submitDisabled}
            className="group h-10 px-5 text-[14px]"
          >
            {pending ? PHASE_LABEL[pending] : primaryLabel}
            {pending ? null : (
              <ArrowRight
                className="transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
