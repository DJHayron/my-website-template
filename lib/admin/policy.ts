import type { AdminRole } from "@/types/admin";

export type ArticleMutation =
  | "archive"
  | "create-draft"
  | "create-published"
  | "update-draft"
  | "update-published";

const permissions: Record<AdminRole, ReadonlySet<ArticleMutation>> = {
  admin: new Set([
    "archive",
    "create-draft",
    "create-published",
    "update-draft",
    "update-published",
  ]),
  editor: new Set(["create-draft", "update-draft"]),
};

export function canMutateArticle(role: AdminRole, mutation: ArticleMutation) {
  return permissions[role].has(mutation);
}

export function getUpdateMutation(existingPublished: boolean, nextPublished: boolean) {
  return existingPublished || nextPublished ? "update-published" : "update-draft";
}
