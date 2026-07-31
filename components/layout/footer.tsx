"use client";

import { usePathname } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { ui } from "@/components/ui/pixel-theme";
import { cn } from "@/lib/utils";
import type { ContactLink, SiteProfile } from "@/data/site";

type FooterProps = {
  contactLinks: ContactLink[];
  siteProfile: SiteProfile;
};

export function Footer({ contactLinks, siteProfile }: FooterProps) {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <footer className="relative mt-0 overflow-hidden border-t border-cyan-300/10 bg-[#050714] py-3">
      <Container className="relative z-10">
        <div
          className={cn(
            "pixel-card flex flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
            ui.panel,
          )}
        >
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-black tracking-wide text-white">
              {siteProfile.brandName}
            </p>
            <p className="mt-0.5 font-mono text-[11px] leading-4 text-[#7f8db3]">
              (c) {currentYear} {siteProfile.name}. Next.js / TypeScript / Tailwind.
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <a
              className="mr-1 max-w-full truncate rounded-sm font-mono text-xs text-[#9fb0d8] transition hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
              href={`mailto:${siteProfile.email}`}
            >
              {siteProfile.email}
            </a>
            {contactLinks.map((link) => (
              <a
                aria-label={link.label}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#30445f] bg-[#101827] text-[#bfe7eb] shadow-[inset_0_-1px_0_#050914,inset_0_1px_0_rgba(255,255,255,0.04)] transition duration-200 hover:border-[#6ea8b0] hover:bg-[#151e2f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                href={link.href}
                key={link.label}
                rel={/^https?:\/\//.test(link.href) ? "noreferrer" : undefined}
                target={/^https?:\/\//.test(link.href) ? "_blank" : undefined}
              >
                <PixelIcon className="h-3.5 w-3.5" name={link.icon} />
              </a>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
