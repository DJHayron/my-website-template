import { promises as fs } from "node:fs";
import path from "node:path";
import { remark } from "remark";
import { z } from "zod";
import { stripByteOrderMark } from "./cache";
import { parseFrontmatter } from "./frontmatter";
import { isSafeMarkdownUrl } from "./url-policy";
import { isSafeResumeDownloadUrl } from "@/lib/site/assets";
import { blogFrontmatterSchema } from "@/lib/blog/schema";
import { parseSafeExistingBlogSlug } from "@/lib/blog/slug";

const PROJECT_GROUPS = ["featured", "systems", "experiments"] as const;
const PROJECT_MATURITIES = [
  "Production",
  "Case Study",
  "Capstone",
  "Prototype",
  "Research",
  "Learning Archive",
] as const;
const ACCENTS = ["cyan", "blue", "purple", "pink", "amber", "green"] as const;
const SINGLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SITE_ASSET_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpg",
  ".jpeg",
  ".png",
  ".svg",
  ".webp",
]);
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

export type ContentValidationIssue = {
  filePath: string;
  message: string;
};

export type ContentValidationResult = {
  blogPosts: number;
  issues: ContentValidationIssue[];
  projects: number;
  siteSettings: boolean;
};

type MarkdownNode = {
  type?: unknown;
  url?: unknown;
  children?: unknown;
};

const stringArraySchema = z
  .array(z.string().trim().min(1))
  .default([]);

const projectMetaSchema = z.object({
  slug: z.string().regex(SINGLE_SLUG_PATTERN),
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  description: z.string().trim().min(1),
  tech: stringArraySchema,
  cover: z.string().trim().min(1),
  coverPosition: z.string().trim().min(1).optional(),
  accent: z.enum(ACCENTS),
  detailsUrl: z.string().trim().min(1),
  caseStudyUrl: z.string().trim().min(1).optional(),
  demoUrl: z.string().trim().min(1).optional(),
  group: z.enum(PROJECT_GROUPS).optional(),
  maturity: z.enum(PROJECT_MATURITIES).optional(),
  order: z.coerce.number().finite().optional(),
  outcomes: stringArraySchema.optional(),
  privateCase: z.boolean().optional(),
  published: z.boolean().optional(),
  publicBoundary: z.string().trim().min(1).optional(),
  relatedTags: stringArraySchema.optional(),
  repoUrl: z.string().trim().min(1).optional(),
  scope: z.string().trim().min(1).optional(),
  year: z.string().trim().min(1).optional(),
}).passthrough();

const siteImageSchema = z.union([
  z.string().trim().min(1),
  z.object({
    position: z.string().trim().min(1).optional(),
    src: z.string().trim().min(1),
  }).passthrough(),
]);

const contactLinkSchema = z.object({
  accent: z.enum(ACCENTS),
  href: z.string().trim().min(1),
  icon: z.enum(["github", "linkedin", "mail", "rss"]),
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
}).passthrough();

const siteSettingsSchema = z.object({
  adjustmentNotes: z.array(z.object({
    accent: z.enum(ACCENTS),
    id: z.string().trim().min(1),
    text: z.string().trim().min(1),
  }).passthrough()).optional(),
  blogPreviewPosts: z.array(z.object({
    category: z.string().trim().min(1),
    date: z.string().trim().min(1),
    excerpt: z.string().trim().min(1),
    href: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    title: z.string().trim().min(1),
  }).passthrough()).optional(),
  contactLinks: z.array(contactLinkSchema).optional(),
  homePageData: z.object({
    hero: z.object({
      description: z.string().trim().min(1).optional(),
      eyebrow: z.string().trim().min(1).optional(),
      techStack: stringArraySchema.optional(),
      titleBottom: z.string().trim().min(1).optional(),
      titleTop: z.string().trim().min(1).optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
  navigationItems: z.array(z.object({
    glow: z.enum(["cyan", "blue", "purple", "pink", "amber"]),
    href: z.string().trim().min(1),
    icon: z.enum(["home", "projects", "file", "journey", "resume", "contact"]),
    key: z.string().trim().min(1),
    label: z.string().trim().min(1),
  }).passthrough()).optional(),
  pageImages: z.record(z.string(), siteImageSchema).optional(),
  pages: z.record(z.string(), z.unknown()).optional(),
  profileMeta: z.object({
    email: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    timezone: z.string().trim().min(1).optional(),
  }).passthrough().optional(),
  resumeExperience: z.array(z.object({
    description: z.string().trim().min(1),
    highlights: stringArraySchema,
    organization: z.string().trim().min(1),
    period: z.string().trim().min(1),
    tech: stringArraySchema.optional(),
    title: z.string().trim().min(1),
  }).passthrough()).optional(),
  resumeSections: z.array(z.object({
    items: stringArraySchema,
    title: z.string().trim().min(1),
  }).passthrough()).optional(),
  resumeSummary: z.string().trim().min(1).optional(),
  routeImageMap: z.array(z.object({
    href: z.string().trim().min(1),
    src: z.string().trim().min(1),
  }).passthrough()).optional(),
  siteUrl: z.string().trim().min(1).optional(),
  siteProfile: z.object({
    brandName: z.string().trim().min(1).optional(),
    facts: z.array(z.object({
      label: z.string().trim().min(1),
      value: z.string().trim().min(1),
    }).passthrough()).optional(),
    headline: z.string().trim().min(1).optional(),
    heroSkills: stringArraySchema.optional(),
    intro: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    positioning: z.string().trim().min(1).optional(),
    resumeDownloadUrl: z.string().trim().min(1).optional(),
    role: z.string().trim().min(1).optional(),
    specialties: stringArraySchema.optional(),
    workingStyle: stringArraySchema.optional(),
  }).passthrough().optional(),
  skillItems: z.array(z.object({
    evidence: stringArraySchema.optional(),
    level: z.enum(["Strong", "Practical", "Applied", "Exploring"]).optional(),
    name: z.string().trim().min(1),
    note: z.string().trim().min(1).optional(),
    subtitle: z.string().trim().min(1).optional(),
    tone: z.enum(["cyan", "green", "blue", "purple", "amber"]),
    value: z.coerce.number().finite().min(0).max(100).optional(),
  }).passthrough()).optional(),
  timelineItems: z.array(z.object({
    summary: z.string().trim().min(1),
    title: z.string().trim().min(1),
    year: z.string().trim().min(1),
  }).passthrough()).optional(),
}).passthrough();

function toDisplayPath(rootDirectory: string, filePath: string) {
  return path.relative(rootDirectory, filePath).split(path.sep).join("/");
}

function addZodIssues(
  issues: ContentValidationIssue[],
  rootDirectory: string,
  filePath: string,
  error: z.ZodError,
) {
  const displayPath = toDisplayPath(rootDirectory, filePath);

  error.issues.forEach((issue) => {
    const fieldPath = issue.path.length ? `${issue.path.join(".")}: ` : "";
    issues.push({
      filePath: displayPath,
      message: `${fieldPath}${issue.message}`,
    });
  });
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getDirectoryNames(directory: string) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function findBlogPostFiles(directory: string): Promise<string[]> {
  let entries;

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];

  if (entries.some((entry) => entry.isFile() && entry.name === "main.md")) {
    files.push(path.join(directory, "main.md"));
  }

  const childFiles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => findBlogPostFiles(path.join(directory, entry.name))),
  );

  return [...files, ...childFiles.flat()];
}

function isSafePublicOrRemoteImage(value: string) {
  if (value.startsWith("generated:")) {
    return true;
  }

  return isSafeMarkdownUrl(value, "image");
}

function isRelativeContentPath(value: string) {
  const trimmedValue = value.trim();

  return (
    trimmedValue.length > 0 &&
    !URL_SCHEME_PATTERN.test(trimmedValue) &&
    !trimmedValue.startsWith("/") &&
    !trimmedValue.startsWith("#")
  );
}

function getSiteImageSrc(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "src" in value &&
    typeof value.src === "string"
  ) {
    return value.src;
  }

  return null;
}

function isSafeSiteUrl(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function validateRuntimePageLinks(
  value: unknown,
  filePath: string,
  rootDirectory: string,
  issues: ContentValidationIssue[],
  pathSegments: string[] = ["pages"],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateRuntimePageLinks(
        item,
        filePath,
        rootDirectory,
        issues,
        [...pathSegments, String(index)],
      );
    });
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.entries(value).forEach(([key, childValue]) => {
    const childPath = [...pathSegments, key];

    if (key.toLowerCase() === "href" && typeof childValue === "string") {
      if (!isSafeMarkdownUrl(childValue, "link")) {
        issues.push({
          filePath: toDisplayPath(rootDirectory, filePath),
          message: `page href URL is not allowed at ${childPath.join(".")}: ${childValue}`,
        });
      }
      return;
    }

    validateRuntimePageLinks(childValue, filePath, rootDirectory, issues, childPath);
  });
}

function getNestedString(value: unknown, pathSegments: string[]) {
  let currentValue = value;

  for (const segment of pathSegments) {
    if (!currentValue || typeof currentValue !== "object" || !(segment in currentValue)) {
      return null;
    }

    currentValue = (currentValue as Record<string, unknown>)[segment];
  }

  return typeof currentValue === "string" ? currentValue : null;
}

function validateResumeDownloadUrl(
  value: string | null | undefined,
  fieldPath: string,
  filePath: string,
  rootDirectory: string,
  issues: ContentValidationIssue[],
) {
  if (!value) {
    return;
  }

  if (!isSafeResumeDownloadUrl(value)) {
    issues.push({
      filePath: toDisplayPath(rootDirectory, filePath),
      message: `resume download URL is not allowed at ${fieldPath}: ${value}`,
    });
  }
}

async function validateSiteImagePath(
  value: string,
  filePath: string,
  rootDirectory: string,
  siteAssetDirectory: string,
  issues: ContentValidationIssue[],
) {
  const displayPath = toDisplayPath(rootDirectory, filePath);

  if (!isSafeMarkdownUrl(value, "image")) {
    issues.push({
      filePath: displayPath,
      message: `site image path is not allowed: ${value}`,
    });
    return;
  }

  if (value.trim().startsWith("/")) {
    issues.push({
      filePath: displayPath,
      message: `site image path is not allowed: ${value}`,
    });
    return;
  }

  if (!isRelativeContentPath(value)) {
    return;
  }

  const assetSegments = value
    .replace(/^\.\/+/, "")
    .split(/[\\/]+/)
    .filter(Boolean);
  if (
    assetSegments.length === 0 ||
    assetSegments.some((segment) => segment === "." || segment === "..")
  ) {
    issues.push({
      filePath: displayPath,
      message: `site image path is not allowed: ${value}`,
    });
    return;
  }

  if (!SITE_ASSET_EXTENSIONS.has(path.extname(assetSegments.at(-1) ?? "").toLowerCase())) {
    issues.push({
      filePath: displayPath,
      message: `site image extension is not allowed: ${value}`,
    });
    return;
  }

  const assetPath = path.resolve(siteAssetDirectory, ...assetSegments);

  if (!(await pathExists(assetPath))) {
    issues.push({
      filePath: displayPath,
      message: `site image file is missing: ${value}`,
    });
    return;
  }

  try {
    const [assetRoot, realAssetPath] = await Promise.all([
      fs.realpath(siteAssetDirectory),
      fs.realpath(assetPath),
    ]);

    if (!(realAssetPath === assetRoot || realAssetPath.startsWith(`${assetRoot}${path.sep}`))) {
      issues.push({
        filePath: displayPath,
        message: `site image resolves outside content/site/assets: ${value}`,
      });
    }
  } catch {
    issues.push({
      filePath: displayPath,
      message: `site image file is not readable: ${value}`,
    });
  }
}

function visitMarkdownNodes(node: unknown, visitor: (node: MarkdownNode) => void) {
  if (!node || typeof node !== "object") {
    return;
  }

  const markdownNode = node as MarkdownNode;
  visitor(markdownNode);

  if (Array.isArray(markdownNode.children)) {
    markdownNode.children.forEach((child) => visitMarkdownNodes(child, visitor));
  }
}

function validateMarkdownUrls(
  markdown: string,
  filePath: string,
  rootDirectory: string,
  issues: ContentValidationIssue[],
) {
  const tree = remark().parse(markdown);
  const displayPath = toDisplayPath(rootDirectory, filePath);

  visitMarkdownNodes(tree, (node) => {
    if ((node.type === "link" || node.type === "image") && typeof node.url === "string") {
      const kind = node.type === "image" ? "image" : "link";

      if (!isSafeMarkdownUrl(node.url, kind)) {
        issues.push({
          filePath: displayPath,
          message: `${kind} URL is not allowed: ${node.url}`,
        });
      }
    }
  });
}

async function validateProjects(
  rootDirectory: string,
  projectDirectory: string,
  issues: ContentValidationIssue[],
) {
  const projectSlugs = await getDirectoryNames(projectDirectory);
  let projectCount = 0;

  for (const folderSlug of projectSlugs) {
    const displayDirectory = toDisplayPath(rootDirectory, path.join(projectDirectory, folderSlug));
    const metaPath = path.join(projectDirectory, folderSlug, "meta.json");
    const markdownPath = path.join(projectDirectory, folderSlug, "main.md");

    if (!SINGLE_SLUG_PATTERN.test(folderSlug)) {
      issues.push({
        filePath: displayDirectory,
        message: "Project folder name must be a URL-safe kebab-case slug.",
      });
      continue;
    }

    if (!(await pathExists(metaPath))) {
      issues.push({ filePath: displayDirectory, message: "Missing meta.json." });
      continue;
    }

    projectCount += 1;

    let rawMeta: unknown;
    try {
      rawMeta = JSON.parse(stripByteOrderMark(await fs.readFile(metaPath, "utf8")));
    } catch (error) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, metaPath),
        message: `Invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
      });
      continue;
    }

    const parsedMeta = projectMetaSchema.safeParse(rawMeta);

    if (!parsedMeta.success) {
      addZodIssues(issues, rootDirectory, metaPath, parsedMeta.error);
      continue;
    }

    const meta = parsedMeta.data;

    if (meta.slug !== folderSlug) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, metaPath),
        message: `slug must match folder name "${folderSlug}".`,
      });
    }

    if (meta.detailsUrl !== `/projects/${folderSlug}`) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, metaPath),
        message: `detailsUrl must be "/projects/${folderSlug}".`,
      });
    }

    if (!isSafePublicOrRemoteImage(meta.cover)) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, metaPath),
        message: `cover path is not allowed: ${meta.cover}`,
      });
    }

    if (!(await pathExists(markdownPath))) {
      issues.push({
        filePath: displayDirectory,
        message: "Missing main.md.",
      });
    } else {
      validateMarkdownUrls(
        stripByteOrderMark(await fs.readFile(markdownPath, "utf8")),
        markdownPath,
        rootDirectory,
        issues,
      );
    }
  }

  return {
    projectCount,
    projectSlugs: new Set(projectSlugs),
  };
}

async function validateBlogPosts(
  rootDirectory: string,
  blogDirectory: string,
  projectSlugs: Set<string>,
  issues: ContentValidationIssue[],
) {
  const postFiles = await findBlogPostFiles(blogDirectory);
  const postRecords = postFiles.map((filePath) => {
    const relativeDirectory = path.relative(blogDirectory, path.dirname(filePath));
    const slug = relativeDirectory.split(path.sep).join("/");

    return {
      filePath,
      parsedSlug: parseSafeExistingBlogSlug(slug),
      slug,
    };
  });
  const safePostSlugs = new Set(
    postRecords.flatMap(({ parsedSlug }) => parsedSlug ? [parsedSlug.slug] : []),
  );
  let visiblePostCount = 0;

  for (const { filePath, parsedSlug, slug } of postRecords) {
    if (!parsedSlug) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, filePath),
        message: "Blog post folder must use one or two safe path segments.",
      });
    } else if (
      parsedSlug.pathSegments.length === 2 &&
      safePostSlugs.has(parsedSlug.pathSegments[0])
    ) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, filePath),
        message: `Blog post "${slug}" is nested under another article directory.`,
      });
    } else {
      visiblePostCount += 1;
    }

    const source = stripByteOrderMark(await fs.readFile(filePath, "utf8"));
    const { data, content } = parseFrontmatter(source);
    const parsedFrontmatter = blogFrontmatterSchema.safeParse(data);

    if (!parsedFrontmatter.success) {
      addZodIssues(issues, rootDirectory, filePath, parsedFrontmatter.error);
    } else {
      const meta = parsedFrontmatter.data;

      if (meta.coverImage && !isSafePublicOrRemoteImage(meta.coverImage)) {
        issues.push({
          filePath: toDisplayPath(rootDirectory, filePath),
          message: `coverImage path is not allowed: ${meta.coverImage}`,
        });
      }

      meta.relatedProjects?.forEach((slug) => {
        if (!projectSlugs.has(slug)) {
          issues.push({
            filePath: toDisplayPath(rootDirectory, filePath),
            message: `relatedProjects references missing project "${slug}".`,
          });
        }
      });
    }

    validateMarkdownUrls(source, filePath, rootDirectory, issues);

    if (!content.trim()) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, filePath),
        message: "Blog post body is empty.",
      });
    }
  }

  return visiblePostCount;
}

async function validateSiteSettings(
  rootDirectory: string,
  siteDirectory: string,
  issues: ContentValidationIssue[],
) {
  const settingsPath = path.join(siteDirectory, "site.json");

  if (!(await pathExists(settingsPath))) {
    return false;
  }

  let rawSettings: unknown;
  try {
    rawSettings = JSON.parse(stripByteOrderMark(await fs.readFile(settingsPath, "utf8")));
  } catch (error) {
    issues.push({
      filePath: toDisplayPath(rootDirectory, settingsPath),
      message: `Invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
    });
    return false;
  }

  const parsedSettings = siteSettingsSchema.safeParse(rawSettings);

  if (!parsedSettings.success) {
    addZodIssues(issues, rootDirectory, settingsPath, parsedSettings.error);
    return false;
  }

  const settings = parsedSettings.data;
  const siteAssetDirectory = path.join(siteDirectory, "assets");
  const siteImageValues = [
    ...Object.values(settings.pageImages ?? {}).map(getSiteImageSrc),
    ...(settings.routeImageMap ?? []).map((entry) => entry.src),
  ].filter((value): value is string => typeof value === "string");

  await Promise.all(
    siteImageValues.map((value) =>
      validateSiteImagePath(
        value,
        settingsPath,
        rootDirectory,
        siteAssetDirectory,
        issues,
      ),
    ),
  );

  settings.contactLinks?.forEach((link) => {
    if (!isSafeMarkdownUrl(link.href, "link")) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, settingsPath),
        message: `contact link URL is not allowed: ${link.href}`,
      });
    }
  });

  settings.blogPreviewPosts?.forEach((post) => {
    if (!isSafeMarkdownUrl(post.href, "link")) {
      issues.push({
        filePath: toDisplayPath(rootDirectory, settingsPath),
        message: `blog preview URL is not allowed: ${post.href}`,
      });
    }
  });

  if (settings.siteUrl && !isSafeSiteUrl(settings.siteUrl)) {
    issues.push({
      filePath: toDisplayPath(rootDirectory, settingsPath),
      message: `siteUrl must be an http(s) URL: ${settings.siteUrl}`,
    });
  }

  if (settings.pages) {
    validateRuntimePageLinks(settings.pages, settingsPath, rootDirectory, issues);
  }

  validateResumeDownloadUrl(
    settings.siteProfile?.resumeDownloadUrl,
    "siteProfile.resumeDownloadUrl",
    settingsPath,
    rootDirectory,
    issues,
  );
  validateResumeDownloadUrl(
    getNestedString(settings.pages, ["home", "heroActions", "resume", "href"]),
    "pages.home.heroActions.resume.href",
    settingsPath,
    rootDirectory,
    issues,
  );
  validateResumeDownloadUrl(
    getNestedString(settings.pages, ["resume", "actions", "download", "href"]),
    "pages.resume.actions.download.href",
    settingsPath,
    rootDirectory,
    issues,
  );

  return true;
}

export async function validateContent(rootDirectory = process.cwd()): Promise<ContentValidationResult> {
  const issues: ContentValidationIssue[] = [];
  const contentDirectory = path.join(rootDirectory, "content");
  const projectDirectory = path.join(contentDirectory, "projects");
  const blogDirectory = path.join(contentDirectory, "blog");
  const siteDirectory = path.join(contentDirectory, "site");

  const { projectCount, projectSlugs } = await validateProjects(
    rootDirectory,
    projectDirectory,
    issues,
  );
  const blogPostCount = await validateBlogPosts(
    rootDirectory,
    blogDirectory,
    projectSlugs,
    issues,
  );
  const siteSettings = await validateSiteSettings(
    rootDirectory,
    siteDirectory,
    issues,
  );

  return {
    blogPosts: blogPostCount,
    issues,
    projects: projectCount,
    siteSettings,
  };
}

export function formatContentValidationResult(result: ContentValidationResult) {
  if (!result.issues.length) {
    return [
      `Content validation passed: ${result.projects} projects, ${result.blogPosts} blog posts, site settings ${result.siteSettings ? "present" : "not present"}.`,
    ];
  }

  return [
    `Content validation failed with ${result.issues.length} issue(s):`,
    ...result.issues.map((issue) => `- ${issue.filePath}: ${issue.message}`),
  ];
}
