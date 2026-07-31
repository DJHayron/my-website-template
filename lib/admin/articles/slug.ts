import { AdminApiError } from "@/lib/admin/http";

const SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const MAXIMUM_SEGMENT_LENGTH = 64;
const MAXIMUM_SLUG_LENGTH = MAXIMUM_SEGMENT_LENGTH * 2 + 1;

export type ValidatedArticleSlug = {
  pathSegments: string[];
  slug: string;
};

function invalidSlug(): never {
  throw new AdminApiError(
    400,
    "invalid_slug",
    "Slug 必須是 1–2 層的小寫 kebab-case 路徑。",
  );
}

export function parseArticleSlug(value: string | readonly string[]): ValidatedArticleSlug {
  const rawValue = Array.isArray(value) ? value.join("/") : value;

  if (
    typeof rawValue !== "string" ||
    rawValue.length === 0 ||
    rawValue.length > MAXIMUM_SLUG_LENGTH ||
    rawValue.includes("%") ||
    rawValue.includes("\\") ||
    rawValue.trim() !== rawValue
  ) {
    return invalidSlug();
  }

  const pathSegments = rawValue.split("/");

  if (
    pathSegments.length < 1 ||
    pathSegments.length > 2 ||
    pathSegments.some(
      (segment) =>
        segment.length === 0 ||
        segment.length > MAXIMUM_SEGMENT_LENGTH ||
        !SEGMENT_PATTERN.test(segment) ||
        WINDOWS_RESERVED_NAME.test(segment),
    )
  ) {
    return invalidSlug();
  }

  return { pathSegments, slug: pathSegments.join("/") };
}

export function assertUnencodedArticlePath(request: Request) {
  const pathname = new URL(request.url).pathname;
  const routePrefix = "/api/admin/posts/";
  const routeIndex = pathname.indexOf(routePrefix);

  if (routeIndex >= 0 && pathname.slice(routeIndex + routePrefix.length).includes("%")) {
    invalidSlug();
  }
}
