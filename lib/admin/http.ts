import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { AdminConfigurationError } from "@/lib/admin/config";
import type { ApiFailure, ApiSuccess } from "@/types/admin";

export const MAX_ADMIN_REQUEST_BYTES = 512 * 1024;

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");

  return NextResponse.json<ApiSuccess<T>>(
    { data, ok: true },
    { ...init, headers },
  );
}

export function apiFailure(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return NextResponse.json<ApiFailure>(
    {
      error: {
        code,
        ...(details === undefined ? {} : { details }),
        message,
      },
      ok: false,
    },
    {
      headers: { "Cache-Control": "no-store" },
      status,
    },
  );
}

export function toApiErrorResponse(error: unknown) {
  if (error instanceof AdminApiError) {
    return apiFailure(error.status, error.code, error.message, error.details);
  }

  if (error instanceof AdminConfigurationError) {
    return apiFailure(503, "admin_unavailable", "後台尚未完成安全設定。");
  }

  return apiFailure(500, "internal_error", "伺服器暫時無法完成要求。");
}

export async function readJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes = MAX_ADMIN_REQUEST_BYTES,
) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();

  if (contentType !== "application/json") {
    throw new AdminApiError(415, "unsupported_media_type", "請以 JSON 格式送出資料。");
  }

  const contentLengthHeader = request.headers.get("content-length");

  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) {
      throw new AdminApiError(400, "invalid_content_length", "Content-Length 不正確。");
    }

    if (Number(contentLengthHeader) > maxBytes) {
      throw new AdminApiError(413, "request_too_large", "要求內容超過允許大小。");
    }
  }

  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  let totalBytes = 0;

  if (reader) {
    while (true) {
      const { done, value: chunk } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += chunk.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new AdminApiError(413, "request_too_large", "要求內容超過允許大小。");
      }

      chunks.push(chunk);
    }
  }

  const rawBody = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);

  let value: unknown;

  try {
    value = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AdminApiError(400, "invalid_json", "JSON 格式不正確。");
  }

  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AdminApiError(
      422,
      "validation_error",
      "輸入資料未通過驗證。",
      result.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join("."),
      })),
    );
  }

  return result.data;
}
