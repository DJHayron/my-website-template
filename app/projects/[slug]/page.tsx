import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarkdownCopyButtons } from "@/components/blog/markdown-copy-buttons";
import { Container } from "@/components/ui/container";
import { NeonButton } from "@/components/ui/neon-button";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { ui } from "@/components/ui/pixel-theme";
import { Section } from "@/components/ui/section";
import { getBlogArticlePath } from "@/lib/blog/slug";
import { cn, formatDate } from "@/lib/utils";
import {
  getAllProjectSlugs,
  getProjectDetailBySlug,
} from "@/lib/projects/details";
import { getProjectAssetUrl } from "@/lib/projects/assets";
import { getSiteSettings } from "@/lib/site/settings";

type ProjectDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateStaticParams() {
  const slugs = await getAllProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: ProjectDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [detail, siteSettings] = await Promise.all([
    getProjectDetailBySlug(slug),
    getSiteSettings(),
  ]);

  if (!detail) {
    return {
      title: siteSettings.pages.projectDetail.notFoundTitle,
    };
  }

  return {
    title: detail.project.title,
    description: detail.project.summary,
    alternates: {
      canonical: detail.project.detailsUrl,
    },
  };
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { slug } = await params;
  const [detail, siteSettings] = await Promise.all([
    getProjectDetailBySlug(slug),
    getSiteSettings(),
  ]);

  if (!detail) {
    notFound();
  }

  const { project } = detail;
  const pageCopy = siteSettings.pages.projectDetail;
  const coverImageUrl = project.cover.startsWith("generated:")
    ? undefined
    : getProjectAssetUrl(project.slug, project.cover);
  const previewStyle = coverImageUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.06), rgba(3, 7, 18, 0.34)), url(${JSON.stringify(coverImageUrl)})`,
        backgroundPosition: project.coverPosition,
        backgroundSize: "cover",
      }
    : { backgroundPosition: project.coverPosition };

  return (
    <Section>
      <Container>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <NeonButton accent="cyan" href="/projects" size="md" variant="ghost">
            <PixelIcon className="h-4 w-4" name="projects" />
            {pageCopy.actions.backToProjects}
          </NeonButton>
          <div className="flex flex-wrap gap-2">
            {project.caseStudyUrl ? (
              <NeonButton accent="purple" href={project.caseStudyUrl} size="md" variant="ghost">
                <PixelIcon className="h-4 w-4" name="file" />
                {pageCopy.actions.caseStudy}
              </NeonButton>
            ) : null}
            {project.repoUrl ? (
              <NeonButton accent="purple" external href={project.repoUrl} size="md" variant="ghost">
                <PixelIcon className="h-4 w-4" name="github" />
                {pageCopy.actions.repository}
              </NeonButton>
            ) : null}
            {project.demoUrl ? (
              <NeonButton accent="amber" external href={project.demoUrl} size="md" variant="ghost">
                <PixelIcon className="h-4 w-4" name="projects" />
                {pageCopy.actions.demo}
              </NeonButton>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <article className="min-w-0">
            <PixelCard accent={project.accent} as="article" className="space-y-5">
              <div
                aria-label={`${project.title} project preview`}
                className={cn(
                  `project-preview project-preview-${project.slug}`,
                  coverImageUrl && "project-preview-image",
                  "max-h-[460px] min-h-64 w-full",
                )}
                data-cover={project.cover}
                role="img"
                style={previewStyle}
              >
                <div className="preview-toolbar">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="preview-grid">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div
                className="prose-content"
                dangerouslySetInnerHTML={{ __html: detail.html }}
              />
              <MarkdownCopyButtons />
            </PixelCard>
          </article>

          <aside className="space-y-5 xl:sticky xl:top-28 xl:self-start">
            <PixelCard accent={project.accent} className="space-y-4">
              <div className="space-y-2">
                <p className="font-mono text-xs font-bold uppercase tracking-wide text-[#8ed2d8]">
                  {pageCopy.summaryTitle}
                </p>
                <p className="text-sm leading-6 text-[#c7d2e5]">{project.summary}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  [pageCopy.fields.year, project.year],
                  [pageCopy.fields.category, project.category],
                  [pageCopy.fields.maturity, project.maturity],
                  [pageCopy.fields.scope, project.scope],
                ].map(([label, value]) =>
                  value ? (
                    <div
                      className="rounded-[4px] border border-[#26344d] bg-[#101827] p-3"
                      key={label}
                    >
                      <p className="font-mono text-[10px] font-bold uppercase text-[#7f8ca8]">
                        {label}
                      </p>
                      <p className="mt-1 font-mono text-xs font-bold text-[#eef3ff]">
                        {value}
                      </p>
                    </div>
                  ) : null,
                )}
              </div>

              <div className="space-y-2">
                <p className="font-mono text-xs font-bold uppercase tracking-wide text-[#8ed2d8]">
                  {pageCopy.techStackTitle}
                </p>
                <div className="flex flex-wrap gap-2">
                  {project.tech.map((tag) => (
                    <span className={ui.tinyTag} key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {project.outcomes?.length ? (
                <div className="space-y-2">
                  <p className="font-mono text-xs font-bold uppercase tracking-wide text-[#8ed2d8]">
                    {pageCopy.verificationTitle}
                  </p>
                  <ul className="space-y-2 text-sm leading-6 text-[#c7d2e5]">
                    {project.outcomes.map((outcome) => (
                      <li className="flex gap-2" key={outcome}>
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-[2px] bg-[#8ed2d8]" />
                        <span>{outcome}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {project.publicBoundary ? (
                <div className="rounded-[4px] border border-[#5d4b32] bg-[#151009] p-3 text-sm leading-6 text-[#e0c28f]">
                  <p className="font-mono text-[11px] font-bold uppercase">
                    {pageCopy.publicBoundaryTitle}
                  </p>
                  <p className="mt-1">{project.publicBoundary}</p>
                </div>
              ) : null}
            </PixelCard>

            {detail.relatedPosts.length ? (
              <PixelCard accent="purple" className="space-y-3">
                <div className="flex items-center gap-2 font-mono text-base font-bold text-white">
                  <PixelIcon className="h-5 w-5" name="file" />
                  {pageCopy.relatedArticlesTitle}
                </div>
                <div className="space-y-2">
                  {detail.relatedPosts.map((post) => (
                    <a
                      className="block rounded-[4px] border border-[#26344d] bg-[#101827] p-3 transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
                      href={getBlogArticlePath(post.slug)}
                      key={post.slug}
                    >
                      <p className="clamp-2 font-mono text-sm font-bold leading-6 text-[#eef3ff]">
                        {post.title}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-[#7f8db3]">
                        {formatDate(post.date)}
                      </p>
                    </a>
                  ))}
                </div>
              </PixelCard>
            ) : null}
          </aside>
        </div>
      </Container>
    </Section>
  );
}
