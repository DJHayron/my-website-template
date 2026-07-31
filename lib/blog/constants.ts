import path from "node:path";

export const BLOG_CONTENT_DIRECTORY = process.env.BLOG_CONTENT_DIRECTORY?.trim()
  ? path.resolve(process.env.BLOG_CONTENT_DIRECTORY)
  : path.join(process.cwd(), "content", "blog");

export const BLOG_FILE_EXTENSION = ".md";
export const BLOG_POST_FILE_NAME = `main${BLOG_FILE_EXTENSION}`;
