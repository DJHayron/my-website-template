import { z } from "zod";

export const BLOG_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const blogStringArraySchema = z.array(z.string().trim().min(1)).default([]);
export const blogTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !/[\r\n]/.test(value), "Tags must not contain line breaks.");
const blogTagArraySchema = z.array(blogTagSchema).max(20).default([]);

export const blogFrontmatterSchema = z.object({
  coverImage: z.string().trim().min(1).optional(),
  date: z.preprocess(
    (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
    z.string().regex(BLOG_DATE_PATTERN),
  ),
  featuredRank: z.coerce.number().finite().optional(),
  order: z.coerce.number().finite().optional(),
  published: z.boolean().optional(),
  relatedProjects: blogStringArraySchema.optional(),
  series: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1),
  tags: blogTagArraySchema.optional(),
  title: z.string().trim().min(1),
}).passthrough();

export type BlogFrontmatterData = z.infer<typeof blogFrontmatterSchema>;
