import { z } from "zod";
import { blogTagSchema } from "@/lib/blog/schema";
import { MAXIMUM_EXISTING_BLOG_SLUG_LENGTH } from "@/lib/blog/slug";

export const loginRequestSchema = z.object({
  password: z.string().min(1).max(256),
  username: z.string().trim().min(3).max(128),
}).strict();

const articleFields = {
  content: z
    .string()
    .max(500_000)
    .refine((value) => value.trim().length > 0, "Markdown content must not be blank."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Date must be a real calendar date."),
  description: z.string().trim().min(1).max(500),
  published: z.boolean(),
  tags: z.array(blogTagSchema).max(20),
  title: z.string().trim().min(1).max(160),
};

export const createArticleRequestSchema = z.object({
  ...articleFields,
  slug: z.string().trim().min(1).max(129),
}).strict();

export const updateArticleRequestSchema = z.object({
  ...articleFields,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  saveMode: z.enum(["manual", "autosave"]).default("manual"),
}).strict();

export const previewArticleRequestSchema = z.object({
  content: articleFields.content,
  slug: z.string().min(1).max(MAXIMUM_EXISTING_BLOG_SLUG_LENGTH),
}).strict();

export type CreateArticleRequest = z.infer<typeof createArticleRequestSchema>;
export type UpdateArticleRequest = z.infer<typeof updateArticleRequestSchema>;
