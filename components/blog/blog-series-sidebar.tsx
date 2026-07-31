"use client";

import Link from "next/link";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { getBlogArticlePath } from "@/lib/blog/slug";
import { sortPostsByPublishedOrder } from "@/lib/blog/sorting";
import { cn, formatDate } from "@/lib/utils";
import type { SiteSettings } from "@/lib/site/settings";
import type {
  BlogPostListing,
  BlogPostListingPage,
  BlogPostMeta,
  BlogSortOrder,
} from "@/types/blog";

type BlogSeriesSidebarProps = {
  copy: SiteSettings["pages"]["blog"]["series"];
  initialPostsComplete?: boolean;
  onSelectPost?: (slug: string) => void;
  posts: BlogPostMeta[];
  selectedPost?: BlogPostMeta;
  selectedSlug?: string;
};

type SeriesPage = Omit<BlogPostListingPage, "posts"> & {
  posts: BlogPostMeta[];
};

const STANDALONE_SERIES_SLUG = "__standalone";
const SERIES_PAGE_SIZE = 5;

type PageCache = Record<string, Record<number, SeriesPage>>;

const createEmptyPage = (page: number): SeriesPage => ({
  hasNextPage: false,
  hasPreviousPage: page > 1,
  page,
  pageSize: SERIES_PAGE_SIZE,
  posts: [],
  totalItems: 0,
  totalPages: 0,
});

const getSeriesSlug = (post: BlogPostMeta) =>
  post.series?.slug ?? STANDALONE_SERIES_SLUG;

const getSeriesTitle = (post: BlogPostMeta, standaloneLabel: string) =>
  post.series?.title ?? standaloneLabel;

const getSeriesKey = (seriesSlug: string, sortOrder: BlogSortOrder) =>
  `${seriesSlug}\u001f${sortOrder}`;

function createPage(posts: BlogPostMeta[], page: number): SeriesPage {
  const totalItems = posts.length;
  const totalPages = Math.ceil(totalItems / SERIES_PAGE_SIZE);
  const startIndex = (page - 1) * SERIES_PAGE_SIZE;

  return {
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
    page,
    pageSize: SERIES_PAGE_SIZE,
    posts: posts.slice(startIndex, startIndex + SERIES_PAGE_SIZE),
    totalItems,
    totalPages,
  };
}

function createInitialSeriesPage(
  posts: BlogPostMeta[],
  seriesSlug: string,
  sortOrder: BlogSortOrder,
  page: number,
) {
  const seriesPosts = posts.filter((post) => getSeriesSlug(post) === seriesSlug);

  return createPage(sortPostsByPublishedOrder(seriesPosts, sortOrder), page);
}

function mergeListingPage(cache: PageCache, listing: BlogPostListing): PageCache {
  const seriesSlug = listing.selectedSeriesSlug;

  if (!seriesSlug) {
    return cache;
  }

  const key = getSeriesKey(seriesSlug, listing.sortOrder);
  const currentPages = cache[key] ?? {};

  return {
    ...cache,
    [key]: {
      ...currentPages,
      [listing.page.page]: listing.page,
      ...(listing.prefetchedPage ? { [listing.prefetchedPage.page]: listing.prefetchedPage } : {}),
    },
  };
}

export function BlogSeriesSidebar({
  copy,
  initialPostsComplete = false,
  onSelectPost,
  posts,
  selectedPost,
  selectedSlug,
}: BlogSeriesSidebarProps) {
  const activePost = selectedPost ?? posts.find((post) => post.slug === selectedSlug);
  const activeSeriesSlug = activePost ? getSeriesSlug(activePost) : undefined;
  const activeSeriesTitle = activePost
    ? getSeriesTitle(activePost, copy.standaloneLabel)
    : copy.standaloneLabel;
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const [sortOrder, setSortOrder] = useState<BlogSortOrder>("newest");
  const [pageCache, setPageCache] = useState<PageCache>({});
  const seriesKey = activeSeriesSlug ? getSeriesKey(activeSeriesSlug, sortOrder) : undefined;
  const page = pageState.key === seriesKey ? pageState.page : 1;
  const cachedPage = seriesKey ? pageCache[seriesKey]?.[page] : undefined;
  const initialPage = useMemo(
    () =>
      activeSeriesSlug
        ? createInitialSeriesPage(posts, activeSeriesSlug, sortOrder, page)
        : createEmptyPage(page),
    [activeSeriesSlug, page, posts, sortOrder],
  );
  const currentPage = cachedPage ?? initialPage;
  const displayTotalPages = Math.max(currentPage.totalPages, 1);

  const setScopedPage = (nextPage: number) => {
    setPageState({
      key: seriesKey ?? "",
      page: Math.max(1, nextPage),
    });
  };

  useEffect(() => {
    if (!activeSeriesSlug || !seriesKey || cachedPage || initialPostsComplete) {
      return;
    }

    const searchParams = new URLSearchParams({
      page: String(page),
      series: activeSeriesSlug,
      sort: sortOrder,
    });
    let isCancelled = false;

    void fetch(`/api/blog/posts?${searchParams.toString()}`, {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load series posts: ${response.status}`);
        }

        return response.json() as Promise<BlogPostListing>;
      })
      .then((listing) => {
        if (!isCancelled) {
          setPageCache((currentCache) => mergeListingPage(currentCache, listing));
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [activeSeriesSlug, cachedPage, initialPostsComplete, page, seriesKey, sortOrder]);

  const handleOpenPost = (slug: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onSelectPost) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    onSelectPost(slug);
  };

  return (
    <PixelCard accent="cyan" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 font-mono text-base font-bold text-white">
          <PixelIcon className="h-5 w-5" name="journey" />
          <span className="truncate">{copy.title}</span>
        </div>
        <button
          className="rounded-[3px] border border-[#315467] bg-[#111c2f] px-2 py-1 font-mono text-[11px] font-bold text-[#b9dfe3] transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f]"
          onClick={() => setSortOrder((currentSortOrder) =>
            currentSortOrder === "newest" ? "oldest" : "newest",
          )}
          type="button"
        >
          {sortOrder === "newest" ? "Newest" : "Oldest"}
        </button>
      </div>

      <section className="rounded-[5px] border border-[#26344d] bg-[#101827] shadow-[inset_0_0_0_1px_#172238]">
        <div className="flex items-center justify-between gap-3 rounded-[4px] px-3 py-3 font-mono text-sm font-bold text-slate-100">
          <span className="truncate">{activeSeriesTitle}</span>
          <span className="text-xs text-slate-400">{currentPage.totalItems}</span>
        </div>

        <div className="space-y-1 p-2">
          {currentPage.posts.length > 0 ? (
            currentPage.posts.map((post) => {
              const isSelected = post.slug === selectedSlug;

              return (
                <Link
                  className={cn(
                    "block w-full rounded-sm px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200",
                    isSelected
                      ? "bg-[#111a2b] text-[#b9dfe3]"
                      : "text-[#b7c2e0] hover:bg-[#151e2f] hover:text-white",
                  )}
                  href={getBlogArticlePath(post.slug)}
                  key={post.slug}
                  onClick={handleOpenPost(post.slug)}
                >
                  <span className="clamp-2 font-mono text-sm font-semibold leading-6">
                    {post.title}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-[#7f8db3]">
                    {formatDate(post.date)}
                  </span>
                </Link>
              );
            })
          ) : (
            <p className="rounded-[4px] border border-[#26344d] bg-[#0b1220] p-3 text-sm leading-6 text-[#9fb0d8]">
              {activeSeriesSlug ? "No articles in this series." : "Loading series..."}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#26344d] p-2 font-mono text-xs text-[#8ea0c8]">
          <button
            className="inline-flex h-8 items-center rounded-[4px] border border-[#26344d] bg-[#0b1220] px-2 font-bold text-[#b9dfe3] transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!currentPage.hasPreviousPage}
            onClick={() => setScopedPage(page - 1)}
            type="button"
          >
            Prev
          </button>
          <span className="min-w-16 text-center">
            {currentPage.page} / {displayTotalPages}
          </span>
          <button
            className="inline-flex h-8 items-center rounded-[4px] border border-[#26344d] bg-[#0b1220] px-2 font-bold text-[#b9dfe3] transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!currentPage.hasNextPage}
            onClick={() => setScopedPage(page + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      </section>
    </PixelCard>
  );
}
