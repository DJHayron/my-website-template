"use client";

import type { ApiFailure, ApiResult } from "@/types/admin";

export class AdminClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdminClientError";
  }
}

function isFailure(value: unknown): value is ApiFailure {
  return Boolean(
    value &&
      typeof value === "object" &&
      "ok" in value &&
      value.ok === false &&
      "error" in value,
  );
}

export async function adminRequest<T>(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  let payload: ApiResult<T> | null = null;

  try {
    payload = (await response.json()) as ApiResult<T>;
  } catch {
    // Convert invalid or non-JSON server responses into a stable client error.
  }

  if (!response.ok || !payload || payload.ok !== true) {
    if (isFailure(payload)) {
      throw new AdminClientError(
        response.status,
        payload.error.code,
        payload.error.message,
        payload.error.details,
      );
    }

    throw new AdminClientError(
      response.status,
      "invalid_server_response",
      "伺服器回應格式不正確，請稍後再試。",
    );
  }

  return payload.data;
}
