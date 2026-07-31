"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BlogPostShowcase } from "@/components/blog/blog-post-showcase";
import { BlogReader } from "@/components/blog/blog-reader";
import { BlogSearchInput } from "@/components/blog/blog-search-input";
import {
  addTagToQuery,
  getTagSearchKey,
  parseBlogSearchQuery,
  removeTagFromQuery,
} from "@/components/blog/blog-search-utils";
import { BlogSeriesSidebar } from "@/components/blog/blog-series-sidebar";
import { BlogSeriesFilter } from "@/components/blog/blog-series-filter";
import { BlogTagFilter } from "@/components/blog/blog-tag-filter";
import type { ProjectItem } from "@/data/site";
import type { SiteSettings } from "@/lib/site/settings";
import type {
  BlogPost,
  BlogPostListItem,
  BlogPostListing,
  BlogPostListingPage,
  BlogSeriesOption,
  BlogSortOrder,
  BlogTagOption,
} from "@/types/blog";

type BlogSearchAppProps = {
  copy: SiteSettings["pages"]["blog"];
  initialListing: BlogPostListing;
  projects: ProjectItem[];
  tags: BlogTagOption[];
};

type BlogViewMode = "browse" | "read";
type PageCache = Record<string, Record<number, BlogPostListingPage>>;
type OpenPostOptions = {
  updateRoute?: boolean;
};

const EMPTY_POSTS: BlogPostListItem[] = [];

const getListingKey = (query: string, seriesSlug?: string, sortOrder: BlogSortOrder = "newest") =>
  [query.trim(), seriesSlug ?? "", sortOrder].join("\u001f");

function createInitialPageCache(listing: BlogPostListing): PageCache {
  const key = getListingKey(listing.query, listing.selectedSeriesSlug, listing.sortOrder);

  return {
    [key]: {
      [listing.page.page]: listing.page,
      ...(listing.prefetchedPage ? { [listing.prefetchedPage.page]: listing.prefetchedPage } : {}),
    },
  };
}

function mergeListingIntoPageCache(cache: PageCache, listing: BlogPostListing): PageCache {
  const key = getListingKey(listing.query, listing.selectedSeriesSlug, listing.sortOrder);
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

function getUniqueKnownPosts(
  featuredPosts: BlogPostListItem[],
  pageCache: PageCache,
  queryKey: string,
) {
  const postMap = new Map<string, BlogPostListItem>();

  featuredPosts.forEach((post) => postMap.set(post.slug, post));
  Object.values(pageCache[queryKey] ?? {}).forEach((page) => {
    page.posts.forEach((post) => postMap.set(post.slug, post));
  });

  return [...postMap.values()];
}

const createEmptyPage = (page: number): BlogPostListingPage => ({
  hasNextPage: false,
  hasPreviousPage: page > 1,
  page,
  pageSize: 5,
  posts: [],
  totalItems: 0,
  totalPages: 0,
});

const getDetailApiPath = (slug: string) =>
  `/api/blog/posts/${slug.split("/").map(encodeURIComponent).join("/")}`;

const getSlugFromBlogPath = (pathname: string) => {
  const match = /^\/blog\/(.+)$/.exec(pathname);

  if (!match) {
    return null;
  }

  try {
    return match[1]
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
};

export function BlogSearchApp({
  copy,
  initialListing,
  projects,
  tags,
}: BlogSearchAppProps) {
  const [query, setQuery] = useState(initialListing.query);
  const [page, setPage] = useState(initialListing.page.page);
  const [selectedSeriesSlug, setSelectedSeriesSlug] = useState<string | undefined>(
    initialListing.selectedSeriesSlug,
  );
  const [sortOrder, setSortOrder] = useState<BlogSortOrder>(initialListing.sortOrder);
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<BlogViewMode>("browse");
  const [pageCache, setPageCache] = useState<PageCache>(() =>
    createInitialPageCache(initialListing),
  );
  const [featuredCache, setFeaturedCache] = useState<Record<string, BlogPostListItem[]>>({
    [getListingKey(
      initialListing.query,
      initialListing.selectedSeriesSlug,
      initialListing.sortOrder,
    )]: initialListing.featuredPosts,
  });
  const [seriesOptions, setSeriesOptions] = useState<BlogSeriesOption[]>(
    initialListing.seriesOptions,
  );
  const [detailCache, setDetailCache] = useState<Record<string, BlogPost>>({});
  const [loadingListingKey, setLoadingListingKey] = useState<string | undefined>();
  const [loadingDetailSlug, setLoadingDetailSlug] = useState<string | undefined>();

  const queryKey = getListingKey(query, selectedSeriesSlug, sortOrder);
  const parsedQuery = useMemo(() => parseBlogSearchQuery(query), [query]);
  const isSearching = query.trim().length > 0;
  const isSeriesMode = Boolean(selectedSeriesSlug);
  const activeSeries = seriesOptions.find((series) => series.slug === selectedSeriesSlug);
  const currentPage = pageCache[queryKey]?.[page] ?? createEmptyPage(page);
  const isCurrentPageLoading =
    loadingListingKey === `${queryKey}:${page}` || !pageCache[queryKey]?.[page];
  const featuredPosts = useMemo(
    () => (isSearching || isSeriesMode ? EMPTY_POSTS : featuredCache[queryKey] ?? EMPTY_POSTS),
    [featuredCache, isSearching, isSeriesMode, queryKey],
  );
  const selectedPost = selectedSlug ? detailCache[selectedSlug] : undefined;
  const knownPosts = useMemo(
    () => getUniqueKnownPosts(featuredPosts, pageCache, queryKey),
    [featuredPosts, pageCache, queryKey],
  );
  const selectedKnownPost = useMemo(
    () => knownPosts.find((post) => post.slug === selectedSlug),
    [knownPosts, selectedSlug],
  );

  const tagLookup = useMemo(
    () => new Map(tags.map((tagOption) => [getTagSearchKey(tagOption.tag), tagOption.tag])),
    [tags],
  );

  const activeTags = useMemo(
    () => parsedQuery.tagFilters.map((tagKey) => tagLookup.get(tagKey) ?? tagKey),
    [parsedQuery.tagFilters, tagLookup],
  );

  const activeTagKeys = useMemo(() => new Set(parsedQuery.tagFilters), [parsedQuery.tagFilters]);

  const storeListing = useCallback((listing: BlogPostListing) => {
    const key = getListingKey(listing.query, listing.selectedSeriesSlug, listing.sortOrder);

    setPageCache((currentCache) => mergeListingIntoPageCache(currentCache, listing));
    setFeaturedCache((currentFeatured) => ({
      ...currentFeatured,
      [key]: listing.featuredPosts,
    }));
    setSeriesOptions(listing.seriesOptions);
  }, []);

  const fetchListing = useCallback(
    async (
      nextQuery: string,
      nextPage: number,
      nextSeriesSlug: string | undefined,
      nextSortOrder: BlogSortOrder,
    ) => {
      const listingKey = getListingKey(nextQuery, nextSeriesSlug, nextSortOrder);
      const requestKey = `${listingKey}:${nextPage}`;
      const searchParams = new URLSearchParams({ page: String(nextPage) });
      const trimmedQuery = nextQuery.trim();

      if (trimmedQuery) {
        searchParams.set("q", trimmedQuery);
      }

      if (nextSeriesSlug) {
        searchParams.set("series", nextSeriesSlug);
        searchParams.set("sort", nextSortOrder);
      }

      setLoadingListingKey(requestKey);

      try {
        const response = await fetch(`/api/blog/posts?${searchParams.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load blog posts: ${response.status}`);
        }

        storeListing((await response.json()) as BlogPostListing);
      } finally {
        setLoadingListingKey((currentKey) => (currentKey === requestKey ? undefined : currentKey));
      }
    },
    [storeListing],
  );

  useEffect(() => {
    const delay = query.trim() ? 250 : 0;
    const timeoutId = window.setTimeout(() => {
      const cachedPage = pageCache[queryKey]?.[page];
      const hasPrefetchedNextPage =
        !cachedPage?.hasNextPage || Boolean(pageCache[queryKey]?.[page + 1]);

      if (!cachedPage || !hasPrefetchedNextPage) {
        void fetchListing(query, page, selectedSeriesSlug, sortOrder);
      }
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [fetchListing, page, pageCache, query, queryKey, selectedSeriesSlug, sortOrder]);

  const handleToggleTag = (tag: string) => {
    setQuery((currentQuery) => {
      const isActive = parseBlogSearchQuery(currentQuery).tagFilters.includes(
        getTagSearchKey(tag),
      );

      return isActive ? removeTagFromQuery(currentQuery, tag) : addTagToQuery(currentQuery, tag);
    });
    setPage(1);
    setViewMode("browse");
  };

  const handleRemoveTag = (tag: string) => {
    setQuery((currentQuery) => removeTagFromQuery(currentQuery, tag));
    setPage(1);
    setViewMode("browse");
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setPage(1);
    setViewMode("browse");
  };

  const handleSelectSeries = (seriesSlug: string) => {
    const nextSeriesSlug = selectedSeriesSlug === seriesSlug ? undefined : seriesSlug;

    setSelectedSeriesSlug(nextSeriesSlug);
    if (!nextSeriesSlug) {
      setSortOrder("newest");
    }
    setPage(1);
    setViewMode("browse");
  };

  const handleClearSeries = () => {
    setSelectedSeriesSlug(undefined);
    setSortOrder("newest");
    setPage(1);
    setViewMode("browse");
  };

  const handleToggleSortOrder = () => {
    setSortOrder((currentSortOrder) =>
      currentSortOrder === "newest" ? "oldest" : "newest",
    );
    setPage(1);
    setViewMode("browse");
  };

  const handleSelectPost = useCallback(
    async (slug: string, options: OpenPostOptions = {}) => {
      setSelectedSlug(slug);
      setViewMode("read");

      if (options.updateRoute !== false && typeof window !== "undefined") {
        window.history.pushState({ blogReaderSlug: slug }, "", `/blog/${slug}`);
      }

      if (detailCache[slug]) {
        return;
      }

      setLoadingDetailSlug(slug);

      try {
        const response = await fetch(getDetailApiPath(slug), { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Failed to load article: ${response.status}`);
        }

        const post = (await response.json()) as BlogPost;
        setDetailCache((currentCache) => ({
          ...currentCache,
          [post.slug]: post,
        }));
      } finally {
        setLoadingDetailSlug((currentSlug) => (currentSlug === slug ? undefined : currentSlug));
      }
    },
    [detailCache],
  );

  useEffect(() => {
    const handlePopState = () => {
      const slug = getSlugFromBlogPath(window.location.pathname);

      if (slug) {
        void handleSelectPost(slug, { updateRoute: false });
        return;
      }

      if (window.location.pathname === "/blog") {
        setSelectedSlug(undefined);
        setViewMode("browse");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handleSelectPost]);

  const handleBackToBrowse = () => {
    if (typeof window !== "undefined") {
      window.history.pushState({ blogReader: "browse" }, "", "/blog");
    }

    setSelectedSlug(undefined);
    setViewMode("browse");
  };

  const handlePageChange = (nextPage: number) => {
    setPage(Math.max(1, nextPage));
    setViewMode("browse");
  };

  if (viewMode === "read") {
    return (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <BlogReader
            copy={copy.reader}
            isLoading={Boolean(selectedSlug && loadingDetailSlug === selectedSlug)}
            onBack={handleBackToBrowse}
            onSelectTag={handleToggleTag}
            post={selectedPost}
            projects={projects}
          />
        </div>

        <aside className="xl:sticky xl:top-28 xl:self-start">
          <BlogSeriesSidebar
            copy={copy.series}
            onSelectPost={handleSelectPost}
            posts={knownPosts}
            selectedPost={selectedPost ?? selectedKnownPost}
            selectedSlug={selectedSlug}
          />
        </aside>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 xl:order-1">
        <BlogPostShowcase
          copy={copy.search}
          featuredPosts={featuredPosts}
          selectedSeriesTitle={activeSeries?.title}
          isLoading={isCurrentPageLoading}
          isSearching={isSearching}
          onPageChange={handlePageChange}
          onSelectPost={handleSelectPost}
          onSelectTag={handleToggleTag}
          page={currentPage}
          sortOrder={sortOrder}
        />
      </div>

      <div className="space-y-5 xl:sticky xl:top-28 xl:order-2 xl:self-start">
        <div>
          <BlogSearchInput
            activeTags={activeTags}
            copy={copy.search}
            onClear={() => handleQueryChange("")}
            onQueryChange={handleQueryChange}
            onRemoveTag={handleRemoveTag}
            query={query}
          />
        </div>
        <div>
          <BlogTagFilter
            activeTagKeys={activeTagKeys}
            copy={copy.search}
            onSelectTag={handleToggleTag}
            tags={tags}
          />
        </div>
        <div>
          <BlogSeriesFilter
            activeSeriesSlug={selectedSeriesSlug}
            onClearSeries={handleClearSeries}
            onSelectSeries={handleSelectSeries}
            onToggleSortOrder={handleToggleSortOrder}
            series={seriesOptions}
            sortOrder={sortOrder}
          />
        </div>
      </div>
    </div>
  );
}
