export type AdminRole = "admin" | "editor";

export type AdminIdentity = {
  displayName: string;
  role: AdminRole;
  username: string;
};

export type AdminArticleStatus = "all" | "draft" | "published";

export type AdminSaveMode = "manual" | "autosave";

export type AdminArticleInput = {
  content: string;
  date: string;
  description: string;
  published: boolean;
  tags: string[];
  title: string;
};

export type AdminArticle = AdminArticleInput & {
  pathSegments: string[];
  revision: string;
  slug: string;
  updatedAt: string;
};

export type AdminArticleListItem = Omit<AdminArticle, "content">;

export type AdminArticleRevision = Pick<AdminArticle, "revision" | "updatedAt">;

export type AdminSession = {
  expiresAt: string;
  user: AdminIdentity;
};

export type ApiSuccess<T> = {
  data: T;
  ok: true;
};

export type ApiFailure = {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  ok: false;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
