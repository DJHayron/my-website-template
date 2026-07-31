const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const UNSAFE_LEGACY_SEGMENT_PATTERN = /[<>:"|?*\\/%\u0000-\u001f\u007f]/;
const MAXIMUM_LEGACY_SEGMENT_LENGTH = 255;

export const MAXIMUM_EXISTING_BLOG_SLUG_LENGTH =
  MAXIMUM_LEGACY_SEGMENT_LENGTH * 2 + 1;

export type SafeExistingBlogSlug = {
  pathSegments: string[];
  slug: string;
};

function encodePathSegment(segment: string) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function encodeBlogSlugPath(slug: string) {
  return slug.split("/").map(encodePathSegment).join("/");
}

export function getBlogArticlePath(slug: string) {
  return `/blog/${encodeBlogSlugPath(slug)}`;
}

export function getBlogArticleApiPath(slug: string) {
  return `/api/blog/posts/${encodeBlogSlugPath(slug)}`;
}

export function parseSafeExistingBlogSlug(
  value: string | readonly string[],
): SafeExistingBlogSlug | null {
  const pathSegments = typeof value === "string" ? value.split("/") : [...value];
  const slug = pathSegments.join("/");

  if (
    slug.length === 0 ||
    slug.length > MAXIMUM_EXISTING_BLOG_SLUG_LENGTH ||
    pathSegments.length < 1 ||
    pathSegments.length > 2 ||
    pathSegments.some(
      (segment) =>
        segment.length === 0 ||
        segment.length > MAXIMUM_LEGACY_SEGMENT_LENGTH ||
        segment.trim() !== segment ||
        segment === "." ||
        segment === ".." ||
        segment.endsWith(".") ||
        WINDOWS_RESERVED_NAME.test(segment) ||
        UNSAFE_LEGACY_SEGMENT_PATTERN.test(segment),
    )
  ) {
    return null;
  }

  return { pathSegments, slug };
}
