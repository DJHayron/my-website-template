import { AdminApiError } from "@/lib/admin/http";
import { parseSafeExistingBlogSlug } from "@/lib/blog/slug";

export type ValidatedArticleSlug = {
  pathSegments: string[];
  slug: string;
};

function invalidSlug(message = "Slug 必須是 1–2 層的安全文章路徑。"): never {
  throw new AdminApiError(
    400,
    "invalid_slug",
    message,
  );
}

export function parseArticleSlug(value: string | readonly string[]): ValidatedArticleSlug {
  const parsed = parseSafeExistingBlogSlug(value);

  if (!parsed) {
    return invalidSlug();
  }

  return parsed;
}

/**
 * Creation and existing-content operations intentionally share one safe path
 * policy so authors can add posts beneath legacy PascalCase or Unicode paths
 * without renaming published URLs.
 */
export function parseExistingArticleSlug(
  value: string | readonly string[],
): ValidatedArticleSlug {
  return parseArticleSlug(value);
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
