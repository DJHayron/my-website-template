# PortfolioKit

A sanitized, file-driven developer portfolio template built with Next.js, TypeScript, Tailwind CSS, runtime Markdown, a protected Blog Admin CMS, and a pixel-night terminal interface.

The goal is to let personal site settings, page images, project cards, project detail pages, and blog posts update from files without rebuilding the app. The built-in authenticated Admin console can create, edit, preview, publish, and recoverably archive Blog posts; site settings and projects remain file-managed. This is useful when the same Docker image keeps running while `content/` is mounted from a persistent volume or updated by a Git sync job.

## Architecture

```txt
app/
  page.tsx                     Home, runtime project highlights
  projects/page.tsx            Project index
  projects/[slug]/page.tsx     Project detail article
  blog/page.tsx                Blog search and reader
  blog/[...slug]/page.tsx      Direct article route
  admin/                       Protected editorial console and login
  api/admin/                   Auth, session, article, and preview APIs

content/
  site/
    site.json                 Runtime profile, navigation, resume, and page images
    assets/                   Personal runtime images served through /site/assets
  projects/
    project-a/
      meta.json                Project card metadata
      main.md                  Long-form project detail
  blog/
    template-architecture/
      main.md                  Blog frontmatter + markdown body

lib/
  admin/                       JWT, RBAC, request policy, and article writes
  projects/meta.ts             Runtime project metadata loader
  projects/details.ts          Project markdown loader
  projects/relations.ts        Blog/project relation matching
  content/validation.ts        Zod content schema validation
  content/cache.ts             mtime-based runtime file cache
  site/settings.ts             Runtime site settings loader
  site/assets.ts               Runtime site asset path guard
  blog/posts.ts                Runtime blog loader
  blog/markdown.ts             Markdown to HTML pipeline
```

Project pages are split into two files:

```txt
content/projects/project-a/meta.json
content/projects/project-a/main.md
```

Blog articles use frontmatter:

```md
---
title: Template Architecture
date: 2026-01-05
summary: How the runtime content system is organized.
tags:
  - Architecture
relatedProjects:
  - project-a
published: true
---
```

Project-to-blog relations work in two ways:

- Explicit: blog `relatedProjects` points to a project slug.
- Tag-based: project `relatedTags` overlaps with blog `tags`.

The Admin CMS deliberately manages Blog posts only. Its API/RBAC contract, environment variables, persistent-volume requirements, backups, archive recovery, and security boundaries are documented in:

- [Admin CMS operations](docs/admin-cms-operations.md)
- [Admin CMS architecture and threat model](docs/admin-cms-architecture.md)

## Validation And CI

Local full check:

```bash
pnpm check
```

Equivalent individual commands:

```bash
pnpm audit:prod
pnpm typecheck
pnpm validate:content
pnpm test:run
pnpm lint
pnpm build
```

CI runs the same quality gates before the Docker image build:

```txt
production audit: No known vulnerabilities found
typecheck:      pass
content schema: pass
unit tests:     pass
lint:           pass
production build: pass
docker build:   pass
```

The full development-tree audit still reports a dev-only `ESLint → minimatch 3 → brace-expansion` advisory. Forcing brace-expansion v5 breaks that legacy consumer's API, so the enforced gate is `pnpm audit:prod` while the repository waits for the upstream minimatch 3 consumer to update.

Docker build is enforced by GitHub Actions and can also be run locally with Docker installed:

```bash
docker build -t portfolio-template:ci .
```

`validate:content` checks site settings, runtime site image paths, project `meta.json`, project detail markdown, blog frontmatter, related project references, date format, enum fields, slug consistency, and unsafe markdown URLs.

## Benchmark

Runtime content behavior:

- Layout, navigation, footer, homepage copy, resume sections, and page images read `content/site/site.json` on request.
- `/projects` reads `content/projects/*/meta.json` on request.
- `/projects/[slug]` reads `content/projects/[slug]/main.md` on request.
- `/blog` reads `content/blog/**/main.md` on request.
- `dynamic = "force-dynamic"` and `revalidate = 0` are used on runtime content routes.
- File reads and markdown rendering use an in-memory mtime cache keyed by file path, `mtimeMs`, and file size.
- Mounted content changes are picked up on the next request after the file timestamp or size changes.
- Runtime site image URLs include a file mtime/size version so replacing an image with the same filename invalidates the Next image cache.

## Screenshots

Add screenshots after customizing the template:

```txt
docs/screenshots/
  home.png
  projects.png
  project-detail.png
  blog.png
  mobile.png
```

Recommended capture checklist:

- Desktop home view
- Projects index
- Project detail with related articles
- Blog article with related projects
- Mobile navigation and single-column content

## Why This Design

This template uses local files instead of a database because the main content workflow is portfolio publishing, not high-frequency multi-user editing.

Key reasons:

- Project cards need structured metadata.
- Project details need long-form Markdown.
- Blog posts need tags, dates, frontmatter, and direct routes.
- Docker deployments can update content by mounting folders.
- Runtime content keeps a small mtime cache so repeated reads avoid unnecessary markdown conversion.
- Git-based content history remains simple and reviewable.

The result is a small content system with a protected Blog editorial console, while avoiding a database or external CMS service.

## Tradeoff

This design intentionally accepts a few constraints:

- The built-in Admin CMS writes Blog posts only; edit site settings and projects through files, Git, or a sync job.
- CMS writes require one writable Node.js instance and a persistent filesystem shared by live Blog content and `content/.trash`; multi-writer and serverless ephemeral deployments are unsupported.
- Runtime file reads plus mtime cache are simpler than a database, but not ideal for very large content collections.
- Markdown raw HTML is disabled and rendered HTML is passed through `rehype-sanitize`.
- Personal page images can live under `content/site/assets`; add your own optimized WebP/AVIF assets when ready.
- Site, project, and blog content schemas are validated by `pnpm validate:content`, but the app still normalizes runtime content defensively.

## Getting Started

```bash
pnpm install
pnpm dev
```

Open:

```txt
http://localhost:3000
```

To enable `/admin`, generate the JWT secret and password hash, configure `.env.local`, then follow the [Admin CMS quick start](docs/admin-cms-operations.md#本機快速啟動). The placeholders in `.env.example` are intentionally unusable.

## Editing Projects

Create or edit:

```txt
content/projects/project-a/meta.json
content/projects/project-a/main.md
```

Minimum `meta.json`:

```json
{
  "slug": "project-a",
  "title": "Project A",
  "category": "Product System",
  "summary": "Short summary.",
  "description": "Longer card description.",
  "tech": ["Next.js", "TypeScript"],
  "cover": "generated:project-a",
  "coverPosition": "center center",
  "accent": "cyan",
  "detailsUrl": "/projects/project-a",
  "group": "featured",
  "published": true,
  "relatedTags": ["Architecture", "Case Study"]
}
```

## Editing Blog Posts

Create or edit:

```txt
content/blog/my-article/main.md
```

Use frontmatter:

```md
---
title: My Article
date: 2026-01-01
summary: Short article summary.
tags:
  - Architecture
relatedProjects:
  - project-a
published: true
featuredRank: 0
---
```

## Editing Site Settings

Create or edit:

```txt
content/site/site.json
content/site/assets/
```

Use `site.json` for profile text, navigation, contact links, resume content, homepage copy, and page image mapping. Public root paths such as `/globe.svg` can reference files in `public/`. Relative image paths such as `hero/home.webp` are served from `content/site/assets/hero/home.webp` through `/site/assets/hero/home.webp`.

Relative site image paths are constrained to `content/site/assets` and must use an allowed image extension: `avif`, `gif`, `jpg`, `jpeg`, `png`, `svg`, or `webp`.

## Docker Runtime Content

Build the image:

```bash
docker build -t portfolio-kit .
```

The following is a public, read-only content deployment; the `:ro` Blog mount cannot support Admin writes:

```bash
docker run --rm -p 3000:3000 \
  -v ./content/site:/app/content/site:ro \
  -v ./content/blog:/app/content/blog:ro \
  -v ./content/projects:/app/content/projects:ro \
  portfolio-kit
```

With this setup, editing mounted content on the host does not require rebuilding the Docker image. To enable Admin writes, mount the whole `/app/content` tree as one writable persistent volume, keep `blog` and `.trash/blog` on the same filesystem, and grant container UID/GID `1001:1001` access. See [Docker and persistent-volume operations](docs/admin-cms-operations.md#docker-與-persistent-volume).

## Standalone Dist Without Content

Build and package the app shell:

```bash
pnpm build
pnpm package:dist
```

The generated `dist/portfolio-template-standalone` and zip intentionally do not
include `content/`. Deploy the app shell once, then update site data by replacing
or mounting `content/site`, `content/blog`, and `content/projects` on the server.
This prevents a packaged app update from accidentally overwriting live content.

## Security Notes

- Markdown raw HTML is disabled.
- Rendered markdown is sanitized with `rehype-sanitize`.
- Markdown links allow `http`, `https`, `mailto`, `tel`, safe relative paths, and hash links.
- Markdown images allow `http`, `https`, safe relative paths, and root-relative public paths.
- Blog and project asset routes constrain paths to their content directories.
- Site image assets served from `/site/assets` are constrained to `content/site/assets`.
- Production dependency audit is enforced by CI with `pnpm audit:prod`.
- The built-in Admin uses JWT/HttpOnly cookies, a configured user whitelist, admin/editor RBAC, Origin validation, strict schemas, slug path guards, revision conflicts, atomic writes, and recoverable archives.
- Secrets and password hashes must be injected at runtime and must never be committed. Review the full [threat model](docs/admin-cms-architecture.md#威脅模型) before enabling writes.

## Admin CMS Verification Status

CI defines a non-root named-volume write smoke, but the production persistent-volume deployment has not yet been exercised locally through login, write, archive, restart, and persistence. The Admin responsive implementation has also not yet been verified with the Codex in-app Browser at target viewports. These are explicit pre-production checks, not completed claims; see [known verification status](docs/admin-cms-operations.md#尚未完成的實機驗證).

## Commit Convention

Use conventional commits:

```txt
<type>(<scope>): <subject>

<body>

<footer>
```

Common types:

```txt
feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert
```
