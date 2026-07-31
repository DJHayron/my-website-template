import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownCopyButtons } from "@/components/blog/markdown-copy-buttons";
import { BlogSeriesSidebar } from "@/components/blog/blog-series-sidebar";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { ui } from "@/components/ui/pixel-theme";
import { getPostBySlug, getPublishedPostListItems } from "@/lib/blog";
import { getBlogArticlePath } from "@/lib/blog/slug";
import { getPublishedProjects } from "@/lib/projects/meta";
import { getRelatedProjectsForPost } from "@/lib/projects/relations";
import { getSiteSettings } from "@/lib/site/settings";
import { formatDate } from "@/lib/utils";

type BlogPostPageProps = {
  params: Promise<{
    slug: string[];
  }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const getSlug = (segments: string[]) => segments.join("/");

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug: slugSegments } = await params;
  const slug = getSlug(slugSegments);
  const [post, siteSettings] = await Promise.all([
    getPostBySlug(slug),
    getSiteSettings(),
  ]);

  if (!post || !post.published) {
    return {
      title: siteSettings.pages.blog.metadata.title,
    };
  }

  const articlePath = getBlogArticlePath(post.slug);

  return {
    title: post.title,
    description: post.summary,
    alternates: {
      canonical: articlePath,
    },
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      url: new URL(articlePath, `${siteSettings.siteUrl}/`).toString(),
      publishedTime: post.date,
      tags: post.tags,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug: slugSegments } = await params;
  const slug = getSlug(slugSegments);
  const [post, posts, projects, siteSettings] = await Promise.all([
    getPostBySlug(slug),
    getPublishedPostListItems(),
    getPublishedProjects(),
    getSiteSettings(),
  ]);

  if (!post || !post.published) {
    notFound();
  }

  const relatedProjects = getRelatedProjectsForPost(post, projects, 3);
  const pageCopy = siteSettings.pages.blog;
  const selectedPostMeta = posts.find((candidate) => candidate.slug === post.slug) ?? {
    coverImage: post.coverImage,
    date: post.date,
    featuredRank: post.featuredRank,
    order: post.order,
    pathSegments: post.pathSegments,
    published: post.published,
    relatedProjects: post.relatedProjects,
    series: post.series,
    slug: post.slug,
    summary: post.summary,
    tags: post.tags,
    title: post.title,
  };

  return (
    <Section>
      <Container>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <PixelCard accent="purple" as="article" className="space-y-5">
              <Link
                className="inline-flex items-center gap-2 rounded-[4px] border border-[#30445f] bg-[#101827] px-3 py-2 font-mono text-sm font-bold text-[#b9dfe3] shadow-[inset_0_-2px_0_#050914,inset_0_1px_0_rgba(255,255,255,0.045)] transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                href="/blog"
              >
                <span aria-hidden className="font-mono">{"<"}</span>
                {pageCopy.reader.backLabel}
              </Link>

              <header className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span className={ui.tinyTag} key={tag}>
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="space-y-4">
                  {post.series ? (
                    <p className="font-mono text-sm font-semibold uppercase text-violet-200">
                      {post.series.title}
                    </p>
                  ) : null}
                  <p className="inline-flex items-center gap-2 font-mono text-sm font-semibold uppercase text-cyan-200">
                    <PixelIcon className="h-4 w-4" name="clock" />
                    <time dateTime={post.date}>{formatDate(post.date)}</time>
                  </p>
                  <h1 className="font-mono text-3xl font-black leading-[1.15] text-white sm:text-5xl">
                    {post.title}
                  </h1>
                  <p className="text-base leading-8 text-[#c7d2ee] sm:text-lg">
                    {post.summary}
                  </p>
                </div>

                {post.coverImage ? (
                  <Image
                    alt=""
                    className="max-h-[28rem] w-full rounded-[5px] border border-[#26344d] object-cover"
                    height={675}
                    loading="lazy"
                    quality={75}
                    sizes="(max-width: 1280px) calc(100vw - 2rem), 860px"
                    src={post.coverImage}
                    width={1200}
                  />
                ) : null}

                {relatedProjects.length ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {relatedProjects.map((project) => (
                      <Link
                        className="rounded-[4px] border border-[#26344d] bg-[#101827] p-3 transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                        href={project.detailsUrl}
                        key={project.slug}
                      >
                        <p className="font-mono text-[11px] font-bold uppercase text-[#8ed2d8]">
                          {pageCopy.reader.relatedProjectLabel}
                        </p>
                        <p className="clamp-2 mt-1 font-mono text-sm font-bold leading-6 text-white">
                          {project.title}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </header>

              <div
                className="prose-content"
                dangerouslySetInnerHTML={{ __html: post.html }}
              />
              <MarkdownCopyButtons />
            </PixelCard>
          </div>

          <aside className="xl:sticky xl:top-28 xl:self-start">
            <BlogSeriesSidebar
              copy={pageCopy.series}
              initialPostsComplete
              posts={posts}
              selectedPost={selectedPostMeta}
              selectedSlug={post.slug}
            />
          </aside>
        </div>
      </Container>
    </Section>
  );
}
