import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getBlogAssetResponse } from "@/app/blog/assets/[...asset]/route";
import { GET as getSiteAssetResponse } from "@/app/site/assets/[...asset]/route";
import {
  getBlogAssetUrl,
  getPostAssetFilePath,
  getSlugSegments,
  getVersionedBlogAssetUrl,
} from "@/lib/blog/assets";
import {
  getSafeResumePdfFilePath,
  getSafeSiteAssetFilePath,
  getSiteAssetUrl,
  getVersionedSiteAssetUrl,
} from "@/lib/site/assets";
import {
  getProjectAssetFilePath,
  getProjectAssetUrl,
  getProjectSlugSegments,
} from "@/lib/projects/assets";

async function createTemporaryBlogAsset() {
  const slug = `route-cache-test-${process.pid}-${Date.now()}`;
  const postDirectory = path.join(process.cwd(), "content", "blog", slug);
  const assetFileName = "diagram.png";
  const assetFilePath = path.join(postDirectory, assetFileName);

  await fs.mkdir(postDirectory, { recursive: true });
  await fs.writeFile(
    path.join(postDirectory, "main.md"),
    `---
title: Route Cache Test
date: 2026-01-01
summary: Test post for asset route cache headers.
tags:
  - Test
published: true
---

Body`,
    "utf8",
  );
  await fs.writeFile(assetFilePath, "fake image bytes");

  const stats = await fs.stat(assetFilePath);

  return {
    assetFileName,
    cleanup: () => fs.rm(postDirectory, { force: true, recursive: true }),
    slug,
    version: `${Math.trunc(stats.mtimeMs)}-${stats.size}`,
  };
}

describe("content path helpers", () => {
  it("validates blog and project slug shapes", () => {
    expect(getSlugSegments("series/post")).toEqual(["series", "post"]);
    expect(getSlugSegments("../post")).toBeNull();
    expect(getProjectSlugSegments("project-a")).toEqual(["project-a"]);
    expect(getProjectSlugSegments("series/project-a")).toBeNull();
  });

  it("rewrites safe relative asset URLs", () => {
    expect(getBlogAssetUrl("series/post", "diagram.png")).toBe(
      "/blog/assets/series/post/diagram.png",
    );
    expect(getProjectAssetUrl("project-a", "demo.png")).toBe(
      "/projects/assets/project-a/demo.png",
    );
  });

  it("adds canonical versions only to safe relative blog asset URLs", async () => {
    const temporaryAsset = await createTemporaryBlogAsset();

    try {
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, temporaryAsset.assetFileName),
      ).resolves.toBe(
        `/blog/assets/${temporaryAsset.slug}/${temporaryAsset.assetFileName}?v=${temporaryAsset.version}`,
      );
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, "https://example.com/image.png"),
      ).resolves.toBe("https://example.com/image.png");
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, "/site/assets/bg.png"),
      ).resolves.toBe("/site/assets/bg.png");
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, "#diagram"),
      ).resolves.toBe("#diagram");
      await expect(
        getVersionedBlogAssetUrl(temporaryAsset.slug, "../secret.png"),
      ).resolves.toBe("../secret.png");
    } finally {
      await temporaryAsset.cleanup();
    }
  });

  it("rejects traversal asset filesystem paths", () => {
    expect(getPostAssetFilePath("post", ["..", "secret.png"])).toBeNull();
    expect(getProjectAssetFilePath("project-a", ["..", "secret.png"])).toBeNull();
  });

  it("limits blog asset filesystem paths to images", () => {
    expect(getPostAssetFilePath("post", ["diagram.png"])).not.toBeNull();
    expect(getPostAssetFilePath("post", ["main.md"])).toBeNull();
    expect(getPostAssetFilePath("post", ["main.1.md"])).toBeNull();
    expect(getPostAssetFilePath("post", ["main.4.md"])).toBeNull();
    expect(getPostAssetFilePath("series", ["post", "main.md"])).toBeNull();
    expect(getPostAssetFilePath("post", [".env"])).toBeNull();
  });

  it("never serves retained Markdown versions through the public blog asset route", async () => {
    const temporaryAsset = await createTemporaryBlogAsset();

    try {
      await fs.writeFile(
        path.join(process.cwd(), "content", "blog", temporaryAsset.slug, "main.1.md"),
        "previous private source",
        "utf8",
      );
      const response = await getBlogAssetResponse(
        new Request(`https://example.test/blog/assets/${temporaryAsset.slug}/main.1.md`),
        {
          params: Promise.resolve({ asset: [temporaryAsset.slug, "main.1.md"] }),
        },
      );

      expect(response.status).toBe(404);
    } finally {
      await temporaryAsset.cleanup();
    }
  });

  it("rewrites and constrains runtime site assets", async () => {
    expect(getSiteAssetUrl("bg.png")).toBe("/site/assets/bg.png");
    expect(getSiteAssetUrl("../secret.png")).toBe("../secret.png");
    await expect(getVersionedSiteAssetUrl("../secret.png")).resolves.toBe("../secret.png");
    await expect(getSafeSiteAssetFilePath(["..", "secret.png"])).resolves.toBeNull();
    await expect(getSafeSiteAssetFilePath(["site.json"])).resolves.toBeNull();
  });

  it("rejects non-canonical site asset versions", async () => {
    const response = await getSiteAssetResponse(
      new Request("https://example.test/site/assets/bg.png?v=wrong"),
      { params: Promise.resolve({ asset: ["bg.png"] }) },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves canonical site asset versions as immutable", async () => {
    const assetPath = path.join(process.cwd(), "content", "site", "assets", "bg.png");
    const stats = await fs.stat(assetPath);
    const version = `${Math.trunc(stats.mtimeMs)}-${stats.size}`;
    const response = await getSiteAssetResponse(
      new Request(`https://example.test/site/assets/bg.png?v=${version}`),
      { params: Promise.resolve({ asset: ["bg.png"] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("Content-Length")).toBe(String(stats.size));
  });

  it("rejects non-canonical blog asset versions", async () => {
    const temporaryAsset = await createTemporaryBlogAsset();

    try {
      const response = await getBlogAssetResponse(
        new Request(
          `https://example.test/blog/assets/${temporaryAsset.slug}/${temporaryAsset.assetFileName}?v=wrong`,
        ),
        {
          params: Promise.resolve({
            asset: [temporaryAsset.slug, temporaryAsset.assetFileName],
          }),
        },
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      await temporaryAsset.cleanup();
    }
  });

  it("serves canonical blog asset versions as immutable", async () => {
    const temporaryAsset = await createTemporaryBlogAsset();

    try {
      const response = await getBlogAssetResponse(
        new Request(
          `https://example.test/blog/assets/${temporaryAsset.slug}/${temporaryAsset.assetFileName}?v=${temporaryAsset.version}`,
        ),
        {
          params: Promise.resolve({
            asset: [temporaryAsset.slug, temporaryAsset.assetFileName],
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=31536000, immutable",
      );
    } finally {
      await temporaryAsset.cleanup();
    }
  });

  it("limits resume PDF resolution to the fixed PDF file", async () => {
    const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-assets-"));
    const assetDirectory = path.join(rootDirectory, "assets");
    await fs.mkdir(assetDirectory, { recursive: true });
    await fs.writeFile(path.join(assetDirectory, "resume.pdf"), "%PDF-1.4\n");

    const filePath = await getSafeResumePdfFilePath(["resume.pdf"], assetDirectory);

    expect(filePath).toBe(path.join(assetDirectory, "resume.pdf"));
    await expect(getSafeResumePdfFilePath(["..", "resume.pdf"], assetDirectory)).resolves.toBeNull();
    await expect(getSafeResumePdfFilePath(["resume.txt"], assetDirectory)).resolves.toBeNull();
    await fs.rm(rootDirectory, { force: true, recursive: true });
  });

  it("rejects missing resume PDFs and symlinks outside the asset root", async () => {
    const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "portfolio-assets-"));
    const assetDirectory = path.join(rootDirectory, "assets");
    const outsideDirectory = path.join(rootDirectory, "outside");
    await fs.mkdir(assetDirectory, { recursive: true });
    await fs.mkdir(outsideDirectory, { recursive: true });

    await expect(getSafeResumePdfFilePath(["resume.pdf"], assetDirectory)).resolves.toBeNull();

    const outsidePdf = path.join(outsideDirectory, "resume.pdf");
    const symlinkPath = path.join(assetDirectory, "resume.pdf");
    await fs.writeFile(outsidePdf, "%PDF-1.4\n");

    try {
      await fs.symlink(outsidePdf, symlinkPath);
    } catch {
      await fs.rm(rootDirectory, { force: true, recursive: true });
      return;
    }

    await expect(getSafeResumePdfFilePath(["resume.pdf"], assetDirectory)).resolves.toBeNull();
    await fs.rm(rootDirectory, { force: true, recursive: true });
  });
});
