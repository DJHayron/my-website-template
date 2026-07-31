import { encodeBlogSlugPath } from "@/lib/blog/slug";

export function getAdminArticleApiPath(slug: string) {
  return `/api/admin/posts/${encodeBlogSlugPath(slug)}`;
}
