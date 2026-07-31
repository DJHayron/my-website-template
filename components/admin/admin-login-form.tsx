"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type LoginFailure = {
  error?: {
    message?: unknown;
  };
  ok?: false;
};

function getFailureMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const failure = value as LoginFailure;

  return typeof failure.error?.message === "string"
    ? failure.error.message
    : null;
}

export function AdminLoginForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setErrorMessage(null);
    setIsSubmitting(true);
    let navigationStarted = false;

    try {
      const response = await fetch("/api/admin/auth/login", {
        body: JSON.stringify({ password, username }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      let result: unknown;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok) {
        setErrorMessage(
          getFailureMessage(result) ?? "登入失敗，請稍後再試一次。",
        );
        return;
      }

      navigationStarted = true;
      router.replace("/admin");
    } catch {
      setErrorMessage("目前無法連線到後台服務，請檢查網路後再試一次。");
    } finally {
      if (!navigationStarted) {
        setIsSubmitting(false);
      }
    }
  }

  const errorId = errorMessage ? "admin-login-error" : undefined;

  return (
    <form
      aria-busy={isSubmitting}
      className="mt-7 space-y-5"
      onSubmit={handleSubmit}
    >
      <div className="space-y-2">
        <label
          className="block font-mono text-xs font-bold tracking-[0.16em] text-[#9fdce1] uppercase"
          htmlFor="admin-username"
        >
          管理帳號
        </label>
        <input
          aria-describedby={errorId}
          aria-invalid={Boolean(errorMessage)}
          autoCapitalize="none"
          autoComplete="username"
          className="h-12 w-full rounded-[4px] border border-[#30445f] bg-[#070d19] px-4 font-mono text-base text-[#eef6ff] caret-cyan-300 shadow-[inset_0_2px_0_rgba(0,0,0,0.35),inset_0_0_0_1px_rgba(255,255,255,0.025)] outline-none transition placeholder:text-[#8795b2] hover:border-[#45647b] focus:border-[#7dd3dc] focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-wait disabled:opacity-60"
          disabled={isSubmitting}
          id="admin-username"
          maxLength={128}
          minLength={3}
          name="username"
          placeholder="輸入白名單帳號"
          required
          spellCheck={false}
          type="text"
        />
      </div>

      <div className="space-y-2">
        <label
          className="block font-mono text-xs font-bold tracking-[0.16em] text-[#9fdce1] uppercase"
          htmlFor="admin-password"
        >
          登入密碼
        </label>
        <input
          aria-describedby={errorId}
          aria-invalid={Boolean(errorMessage)}
          autoComplete="current-password"
          className="h-12 w-full rounded-[4px] border border-[#30445f] bg-[#070d19] px-4 font-mono text-base text-[#eef6ff] caret-cyan-300 shadow-[inset_0_2px_0_rgba(0,0,0,0.35),inset_0_0_0_1px_rgba(255,255,255,0.025)] outline-none transition placeholder:text-[#8795b2] hover:border-[#45647b] focus:border-[#7dd3dc] focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-wait disabled:opacity-60"
          disabled={isSubmitting}
          id="admin-password"
          maxLength={256}
          name="password"
          placeholder="輸入後台密碼"
          required
          type="password"
        />
      </div>

      <div aria-live="polite" aria-atomic="true" className="min-h-12">
        {errorMessage ? (
          <p
            className="flex min-h-12 items-center rounded-[4px] border border-rose-400/45 bg-rose-950/35 px-3 py-2.5 text-sm leading-6 text-rose-100"
            id="admin-login-error"
            role="alert"
          >
            <span
              aria-hidden="true"
              className="mr-2 inline-block size-2 shrink-0 bg-rose-300 shadow-[0_0_8px_rgba(253,164,175,0.6)]"
            />
            {errorMessage}
          </p>
        ) : isSubmitting ? (
          <p className="flex min-h-12 items-center px-1 font-mono text-sm text-[#9fdce1]">
            <span
              aria-hidden="true"
              className="mr-3 inline-block size-3 animate-spin border-2 border-[#315467] border-t-cyan-200 motion-reduce:animate-none"
            />
            正在驗證安全憑證…
          </p>
        ) : (
          <p className="flex min-h-12 items-center px-1 text-sm leading-6 text-[#8795b2]">
            系統只接受後台白名單中的帳號。
          </p>
        )}
      </div>

      <button
        className="group relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[4px] border border-[#4f8492] bg-[#102637] px-5 font-mono text-sm font-extrabold tracking-[0.12em] text-[#dffcff] shadow-[inset_0_-3px_0_#06101c,inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(34,211,238,0.08)] transition hover:border-[#8ed2d8] hover:bg-[#153246] hover:shadow-[inset_0_-3px_0_#06101c,inset_0_1px_0_rgba(255,255,255,0.1),0_0_22px_rgba(34,211,238,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050714] disabled:cursor-wait disabled:border-[#30445f] disabled:bg-[#101827] disabled:text-[#7f8ca8] disabled:shadow-[inset_0_-2px_0_#050914]"
        disabled={isSubmitting}
        type="submit"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent opacity-70"
        />
        {isSubmitting ? "驗證中…" : "進入編輯控制台"}
      </button>
    </form>
  );
}
