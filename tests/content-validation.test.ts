import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateContent } from "@/lib/content/validation";

let rootDirectory: string;

async function writeFile(relativePath: string, content: string) {
  const filePath = path.join(rootDirectory, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function writeValidProject(slug = "project-a") {
  await writeFile(
    `content/projects/${slug}/meta.json`,
    JSON.stringify(
      {
        slug,
        title: "Project A",
        category: "Product System",
        summary: "Summary",
        description: "Description",
        tech: ["Next.js"],
        cover: `generated:${slug}`,
        accent: "cyan",
        detailsUrl: `/projects/${slug}`,
        published: true,
      },
      null,
      2,
    ),
  );
  await writeFile(`content/projects/${slug}/main.md`, "# Project A\n\n![Diagram](diagram.png)");
}

async function writeValidBlogPost(slug: string, title = slug) {
  await writeFile(
    `content/blog/${slug}/main.md`,
    `---
title: ${title}
date: 2026-01-01
summary: Legacy-compatible article.
tags:
  - Test
published: true
---

# ${title}
`,
  );
}

beforeEach(async () => {
  rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-content-"));
});

afterEach(async () => {
  await fs.rm(rootDirectory, { force: true, recursive: true });
});

describe("content validation", () => {
  it("passes for a valid project and blog post", async () => {
    await writeValidProject();
    await writeFile(
      "content/blog/example/main.md",
      `---
title: Example
date: 2026-01-01
summary: Example summary.
tags:
  - Architecture
relatedProjects:
  - project-a
published: true
---

# Example

[Read more](/projects/project-a)
`,
    );

    const result = await validateContent(rootDirectory);

    expect(result.issues).toEqual([]);
    expect(result.projects).toBe(1);
    expect(result.blogPosts).toBe(1);
  });

  it("accepts safe existing legacy blog folder names", async () => {
    await Promise.all([
      writeValidBlogPost("CaseStudy"),
      writeValidBlogPost("LeetCodeEssential150/1.TwoSums"),
      writeValidBlogPost("8.StringToInteger(atoi)"),
      writeValidBlogPost("LeetCode/模板"),
      writeValidBlogPost("155.Min Stack"),
    ]);

    const result = await validateContent(rootDirectory);

    expect(result.issues).toEqual([]);
    expect(result.blogPosts).toBe(5);
  });

  it("reports blog layouts hidden by the runtime loader", async () => {
    await Promise.all([
      writeValidBlogPost("parent"),
      writeValidBlogPost("parent/child"),
      writeValidBlogPost("one/two/three"),
    ]);

    const result = await validateContent(rootDirectory);
    const messages = result.issues.map((issue) => issue.message);

    expect(messages).toContain(
      'Blog post "parent/child" is nested under another article directory.',
    );
    expect(messages).toContain("Blog post folder must use one or two safe path segments.");
    expect(result.blogPosts).toBe(1);
  });

  it("reports invalid project metadata and unsafe markdown URLs", async () => {
    await writeValidProject();
    await writeFile(
      "content/projects/broken-project/meta.json",
      JSON.stringify({
        slug: "wrong-slug",
        title: "Broken",
        category: "Product System",
        summary: "Summary",
        description: "Description",
        tech: ["Next.js"],
        cover: "../secret.png",
        accent: "cyan",
        detailsUrl: "/projects/not-matching",
      }),
    );
    await writeFile("content/projects/broken-project/main.md", "![Bad](javascript:alert(1))");
    await writeFile(
      "content/blog/broken/main.md",
      `---
title: Broken
date: 2026-99-99
summary: Broken summary.
relatedProjects:
  - missing-project
published: true
---

[Bad](javascript:alert(1))
`,
    );

    const result = await validateContent(rootDirectory);
    const messages = result.issues.map((issue) => issue.message);

    expect(messages).toContain('slug must match folder name "broken-project".');
    expect(messages).toContain('detailsUrl must be "/projects/broken-project".');
    expect(messages).toContain("cover path is not allowed: ../secret.png");
    expect(messages).toContain('relatedProjects references missing project "missing-project".');
    expect(messages.some((message) => message.includes("URL is not allowed"))).toBe(true);
  });

  it("validates runtime site settings and site image assets", async () => {
    await writeValidProject();
    await writeFile("content/site/assets/bg.png", "fake image");
    await writeFile(
      "content/site/site.json",
      JSON.stringify({
        contactLinks: [
          {
            accent: "cyan",
            href: "https://example.com",
            icon: "github",
            label: "GitHub",
            value: "example",
          },
        ],
        pageImages: {
          homeHero: {
            src: "bg.png",
          },
        },
        pages: {
          home: {
            heroActions: {
              projects: {
                href: "/projects",
                label: "Projects",
              },
              resume: {
                href: "/resume.pdf",
                label: "Download Resume",
              },
            },
          },
          resume: {
            actions: {
              download: {
                href: "resume.pdf",
                label: "Download CV",
              },
            },
          },
        },
        siteProfile: {
          resumeDownloadUrl: "/site/assets/resume.pdf",
        },
        siteUrl: "https://example.com",
        skillItems: [
          {
            evidence: ["Shipped project", "SQLite workflow"],
            name: "Desktop Systems",
            subtitle: "Local-first desktop tools",
            tone: "cyan",
          },
        ],
      }),
    );

    const result = await validateContent(rootDirectory);

    expect(result.issues).toEqual([]);
    expect(result.siteSettings).toBe(true);
  });

  it("reports unsafe runtime site settings", async () => {
    await writeValidProject();
    await writeFile(
      "content/site/site.json",
      JSON.stringify({
        contactLinks: [
          {
            accent: "cyan",
            href: "javascript:alert(1)",
            icon: "github",
            label: "GitHub",
            value: "example",
          },
        ],
        pageImages: {
          homeHero: {
            src: "../secret.png",
          },
          blogHero: {
            src: "/optimized/foo.webp",
          },
          resumeHero: {
            src: "resume.txt",
          },
        },
        pages: {
          home: {
            heroActions: {
              projects: {
                href: "javascript:alert(1)",
                label: "Projects",
              },
              resume: {
                href: "../secret.pdf",
                label: "Download Resume",
              },
            },
          },
          resume: {
            actions: {
              download: {
                href: "/resume.txt",
                label: "Download CV",
              },
            },
          },
        },
        siteProfile: {
          resumeDownloadUrl: "https://example.com/resume.pdf",
        },
        siteUrl: "javascript:alert(1)",
      }),
    );

    const result = await validateContent(rootDirectory);
    const messages = result.issues.map((issue) => issue.message);

    expect(messages).toContain("site image path is not allowed: ../secret.png");
    expect(messages).toContain("site image path is not allowed: /optimized/foo.webp");
    expect(messages).toContain("site image extension is not allowed: resume.txt");
    expect(messages).toContain("contact link URL is not allowed: javascript:alert(1)");
    expect(messages).toContain("siteUrl must be an http(s) URL: javascript:alert(1)");
    expect(messages).toContain(
      "page href URL is not allowed at pages.home.heroActions.projects.href: javascript:alert(1)",
    );
    expect(messages).toContain(
      "resume download URL is not allowed at siteProfile.resumeDownloadUrl: https://example.com/resume.pdf",
    );
    expect(messages).toContain(
      "resume download URL is not allowed at pages.home.heroActions.resume.href: ../secret.pdf",
    );
    expect(messages).toContain(
      "resume download URL is not allowed at pages.resume.actions.download.href: /resume.txt",
    );
  });
});
