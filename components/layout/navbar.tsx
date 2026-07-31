"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { Container } from "@/components/ui/container";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { preloadRouteImageForHref } from "@/lib/performance/preload-image";
import { cn } from "@/lib/utils";
import type { NavigationItem } from "@/data/site";
import type { RouteImageEntry } from "@/lib/performance/route-images";

type NavbarProps = {
  brandName: string;
  navigationItems: NavigationItem[];
  role: string;
  routeImageMap: RouteImageEntry[];
};

const navItemBase =
  "inline-flex h-10 max-w-[8.5rem] items-center gap-2 rounded-[4px] border px-4 font-mono text-sm font-bold leading-none tracking-wide transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200";
const navItemInactive =
  "border-[#26344d] bg-[#101827]/90 text-slate-200 shadow-[inset_0_-2px_0_#050914,inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-[#6ea8b0] hover:bg-[#151e2f] hover:text-cyan-100 hover:shadow-[inset_0_-2px_0_#050914,inset_0_1px_0_rgba(255,255,255,0.055),0_0_12px_rgba(34,211,238,0.08)]";
const navItemActive =
  "border-[#6ea8b0] bg-[#151e2f] text-cyan-100 shadow-[inset_0_-2px_0_#050914,inset_0_1px_0_rgba(255,255,255,0.06),0_0_14px_rgba(34,211,238,0.1)]";

function normalizeHref(href: string) {
  return href.split("#")[0] || "/";
}

function isActivePath(pathname: string, item: NavigationItem) {
  const href = normalizeHref(item.href);
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Navbar({ brandName, navigationItems, role, routeImageMap }: NavbarProps) {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <header className="fixed top-0 z-50 w-full bg-linear-to-b from-[#050714]/72 via-[#050714]/38 to-transparent">
      <Container className="flex h-[72px] items-center justify-between gap-4 py-2">
        <Link
          className="group flex min-w-0 max-w-52 flex-col rounded-[4px] px-2 py-1 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          href="/"
        >
          <span className="truncate font-mono text-lg font-black tracking-wide text-white transition group-hover:text-cyan-100">
            {"{<>}"} {brandName}
          </span>
          <span className="truncate font-mono text-xs text-[#b7c2e0]">{role}</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-2 px-1.5 py-1.5 lg:flex">
          {navigationItems.map((item) => {
            const active = isActivePath(pathname, item);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  navItemBase,
                  active ? navItemActive : navItemInactive,
                )}
                href={item.href}
                key={item.href}
                onFocus={() => preloadRouteImageForHref(item.href, routeImageMap)}
                onMouseEnter={() => preloadRouteImageForHref(item.href, routeImageMap)}
              >
                <PixelIcon className="h-4 w-4" name={item.icon} />
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="lg:hidden">
          <MobileMenu
            navigationItems={navigationItems}
            pathname={pathname}
            routeImageMap={routeImageMap}
          />
        </div>
      </Container>
    </header>
  );
}
