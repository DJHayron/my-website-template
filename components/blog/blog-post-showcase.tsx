"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { getBlogArticlePath } from "@/lib/blog/slug";
import { cn, formatDate } from "@/lib/utils";
import type { SiteSettings } from "@/lib/site/settings";
import type { BlogPostListItem, BlogPostListingPage, BlogSortOrder } from "@/types/blog";

type BlogPostShowcaseProps = {
  featuredPosts: BlogPostListItem[];
  copy: SiteSettings["pages"]["blog"]["search"];
  isSearching: boolean;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onSelectPost: (slug: string) => void;
  onSelectTag: (tag: string) => void;
  page: BlogPostListingPage;
  selectedSeriesTitle?: string;
  sortOrder: BlogSortOrder;
};

function getPostIcon(post: BlogPostListItem) {
  const searchText = [...post.tags, post.series?.title ?? "", post.title].join(" ").toLowerCase();

  if (searchText.includes("typescript")) {
    return "tech-ts" as const;
  }

  if (searchText.includes("markdown")) {
    return "file" as const;
  }

  if (searchText.includes("deploy") || searchText.includes("docker")) {
    return "projects" as const;
  }

  return "skills" as const;
}

const categoryToneClasses = {
  architecture: "border-[#315467] bg-[#111c2f] text-[#b9dfe3] hover:border-[#6ea8b0]",
  deployment: "border-[#5d4b32] bg-[#1d1720] text-[#e0c28f] hover:border-[#c79658]",
  markdown: "border-[#4b3e61] bg-[#151426] text-[#d3c4e4] hover:border-[#a997c2]",
  default: "border-[#315467] bg-[#111c2f] text-[#d7e9ee] hover:border-[#6ea8b0]",
};

function getCategoryToneClass(post: BlogPostListItem) {
  const searchText = [...post.tags, post.series?.title ?? ""].join(" ").toLowerCase();

  if (searchText.includes("deploy") || searchText.includes("docker")) {
    return categoryToneClasses.deployment;
  }

  if (searchText.includes("markdown")) {
    return categoryToneClasses.markdown;
  }

  if (searchText.includes("architecture") || searchText.includes("type")) {
    return categoryToneClasses.architecture;
  }

  return categoryToneClasses.default;
}

function BlogPostCard({
  copy,
  onSelectPost,
  onSelectTag,
  post,
}: Pick<BlogPostShowcaseProps, "copy" | "onSelectPost" | "onSelectTag"> & {
  post: BlogPostListItem;
}) {
  const handleOpenPost = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    onSelectPost(post.slug);
  };

  return (
    <article
      className="pixel-card group relative grid min-h-[172px] overflow-hidden rounded-[6px] border border-[#26344d] bg-[#0b1220] p-4 shadow-[inset_0_0_0_1px_#111b2d,0_8px_22px_rgba(0,0,0,0.24)] transition-colors duration-200 hover:border-[#5f7c94] hover:bg-[#101827] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_10px_28px_rgba(0,0,0,0.28),0_0_14px_rgba(34,211,238,0.06)] sm:grid-cols-[minmax(0,1fr)_150px] sm:gap-5"
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-[#8ea0c8]">
          <button
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 truncate rounded-[3px] border px-2 py-1 font-bold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200",
              getCategoryToneClass(post),
            )}
            onClick={() => onSelectTag(post.tags[0] ?? post.series?.title ?? post.title)}
            type="button"
          >
            <span aria-hidden className="shrink-0">
              #
            </span>
            {post.tags[0] ?? post.series?.title ?? copy.categoryFallback}
          </button>
          <time className="inline-flex min-h-7 items-center" dateTime={post.date}>
            {formatDate(post.date)}
          </time>
        </div>

        <Link
          className="mt-4 block rounded-[4px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
          href={getBlogArticlePath(post.slug)}
          onClick={handleOpenPost}
        >
          <h3 className="clamp-2 font-mono text-xl font-black leading-7 text-white transition group-hover:text-cyan-100">
            {post.title}
          </h3>
          <p className="clamp-2 mt-3 max-w-[64ch] text-sm leading-6 text-[#aeb9cc]">
            {post.summary}
          </p>
        </Link>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <p className="inline-flex items-center gap-2 font-mono text-xs text-[#7f8db3]">
            <PixelIcon className="h-3.5 w-3.5" name="clock" />
            {post.readTimeMinutes} {copy.readTimeSuffix}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-[#30445f] bg-[#101827] px-3 font-mono text-xs font-bold text-[#b9dfe3] shadow-[inset_0_-2px_0_#050914,inset_0_1px_0_rgba(255,255,255,0.045)] transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
              href={getBlogArticlePath(post.slug)}
              onClick={handleOpenPost}
            >
              {copy.quickReadButtonLabel}
              <span aria-hidden>-&gt;</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4 hidden items-center justify-center sm:mt-0 sm:flex">
        <div
          className={cn(
            "relative flex h-28 w-32 items-center justify-center overflow-hidden rounded-[5px] border bg-[#101827] shadow-[inset_0_0_0_1px_#172238]",
            post.tags[0]?.toLowerCase().includes("deployment")
              ? "border-amber-300/20"
              : "border-[#26344d]",
          )}
        >
          <div className="absolute inset-2 rounded-[3px] border border-[#26344d] bg-[#0b172b]" />
          <div className="absolute left-3 top-3 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-[2px] bg-cyan-200/70" />
            <span className="h-1.5 w-8 rounded-[2px] bg-cyan-200/20" />
          </div>
          <PixelIcon className="relative h-12 w-12 opacity-90" name={getPostIcon(post)} />
          <div className="absolute inset-x-3 bottom-3 grid gap-1.5">
            <span className="h-1 rounded-[2px] bg-cyan-200/18" />
            <span className="h-1 w-2/3 rounded-[2px] bg-cyan-200/12" />
          </div>
        </div>
      </div>
    </article>
  );
}

export function BlogPostShowcase({
  copy,
  featuredPosts,
  isLoading,
  isSearching,
  onPageChange,
  onSelectPost,
  onSelectTag,
  page,
  selectedSeriesTitle,
  sortOrder,
}: BlogPostShowcaseProps) {
  const displayTotalPages = Math.max(page.totalPages, 1);
  const title = selectedSeriesTitle
    ? `Series: ${selectedSeriesTitle}`
    : isSearching
      ? copy.searchResultsTitle
      : copy.latestArticlesTitle;
  const description = selectedSeriesTitle
    ? `${page.totalItems} articles, sorted ${sortOrder === "newest" ? "newest first" : "oldest first"}`
    : isSearching
      ? `${page.totalItems} ${
          page.totalItems === 1 ? copy.matchingArticleSingular : copy.matchingArticlePlural
        }`
      : copy.latestArticlesDescription;

  return (
    <div className="space-y-5">
      {!isSearching && featuredPosts.length > 0 ? (
        <PixelCard accent="purple" className="space-y-4 p-3!">
          <div>
            <h2 className="font-mono text-xl font-black text-white">
              Recommended articles
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#9fb0d8]">
              Curated notes to start with
            </p>
          </div>
          <div className="grid gap-3">
            {featuredPosts.map((post) => (
              <BlogPostCard
                copy={copy}
                key={post.slug}
                onSelectPost={onSelectPost}
                onSelectTag={onSelectTag}
                post={post}
              />
            ))}
          </div>
        </PixelCard>
      ) : null}

      <PixelCard accent="cyan" className="space-y-4 p-3!">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-mono text-xl font-black text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#9fb0d8]">{description}</p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-[#8ea0c8]">
          <button
            className="inline-flex h-9 items-center rounded-[4px] border border-[#26344d] bg-[#0b1220] px-3 font-bold text-[#b9dfe3] transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!page.hasPreviousPage || isLoading}
            onClick={() => onPageChange(page.page - 1)}
            type="button"
          >
            Prev
          </button>
          <span className="min-w-20 text-center">
            {page.page} / {displayTotalPages}
          </span>
          <button
            className="inline-flex h-9 items-center rounded-[4px] border border-[#26344d] bg-[#0b1220] px-3 font-bold text-[#b9dfe3] transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!page.hasNextPage || isLoading}
            onClick={() => onPageChange(page.page + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      </div>

      {page.posts.length > 0 ? (
        <div className="grid gap-3">
          {page.posts.map((post) => (
            <BlogPostCard
              copy={copy}
              key={post.slug}
              onSelectPost={onSelectPost}
              onSelectTag={onSelectTag}
              post={post}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-[4px] border border-[#26344d] bg-[#101827] p-5 text-sm leading-6 text-[#9fb0d8]">
          {copy.emptyMessage}
        </p>
      )}
      </PixelCard>
    </div>
  );
}
