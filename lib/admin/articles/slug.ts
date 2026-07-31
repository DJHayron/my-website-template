import { AdminApiError } from "@/lib/admin/http";
import {
  parseSafeExistingBlogSlug,
  type SafeExistingBlogSlug,
} from "@/lib/blog/slug";

const CANONICAL_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAXIMUM_CANONICAL_SEGMENT_LENGTH = 64;
const MAXIMUM_CANONICAL_SLUG_LENGTH = MAXIMUM_CANONICAL_SEGMENT_LENGTH * 2 + 1;

export type ValidatedArticleSlug = {
  pathSegments: string[];
  slug: string;
};

function invalidSlug(message = "Slug 必須是 1–2 層的小寫 kebab-case 路徑。"): never {
  throw new AdminApiError(
    400,
    "invalid_slug",
    message,
  );
}

function getPathSegments(value: string | readonly string[]) {
  return typeof value === "string" ? value.split("/") : [...value];
}

export function parseArticleSlug(value: string | readonly string[]): ValidatedArticleSlug {
  const pathSegments = getPathSegments(value);
  const rawValue = pathSegments.join("/");

  if (
    rawValue.length === 0 ||
    rawValue.length > MAXIMUM_CANONICAL_SLUG_LENGTH ||
    rawValue.includes("%") ||
    rawValue.includes("\\") ||
    rawValue.trim() !== rawValue
  ) {
    return invalidSlug();
  }

  if (
    pathSegments.length < 1 ||
    pathSegments.length > 2 ||
    pathSegments.some(
      (segment) =>
        segment.length === 0 ||
        segment.length > MAXIMUM_CANONICAL_SEGMENT_LENGTH ||
        !CANONICAL_SEGMENT_PATTERN.test(segment) ||
        WINDOWS_RESERVED_NAME.test(segment),
    )
  ) {
    return invalidSlug();
  }

  return { pathSegments, slug: pathSegments.join("/") };
}

/**
 * Existing content predates the CMS naming convention. Preserve exact safe
 * filesystem names while keeping new article creation on canonical slugs.
 */
export function parseExistingArticleSlug(
  value: string | readonly string[],
): ValidatedArticleSlug {
  const parsed = parseSafeExistingBlogSlug(value);

  if (!parsed) {
    return invalidSlug("既有文章 slug 必須是 1–2 層的安全路徑。");
  }

  return parsed satisfies SafeExistingBlogSlug;
}

export function assertSafeArticleRoutePath(request: Request) {
  const pathname = new URL(request.url).pathname;
  const routePrefix = "/api/admin/posts/";
  if (!pathname.startsWith(routePrefix)) {
    return invalidSlug("文章 API 路徑不符合預期格式。");
  }

  const encodedSegments = pathname.slice(routePrefix.length).split("/");

  try {
    if (encodedSegments.some((segment) => /%(?:2f|5c)/i.test(segment))) {
      return invalidSlug("文章 API 路徑包含編碼過的分隔符號。");
    }

    parseExistingArticleSlug(encodedSegments.map((segment) => decodeURIComponent(segment)));
  } catch (error) {
    if (error instanceof AdminApiError) {
      throw error;
    }

    invalidSlug("文章 API 路徑包含無效的 percent encoding。");
  }
}
