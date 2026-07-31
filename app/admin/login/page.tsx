import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { PixelCard } from "@/components/ui/pixel-card";
import { getServerAdminSession } from "@/lib/admin/server-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "HayronHgh 文章編輯控制台安全登入頁面。",
  robots: { follow: false, index: false },
  title: "後台登入",
};

const stars = [
  "left-[7%] top-[15%]",
  "left-[18%] top-[31%]",
  "left-[28%] top-[9%]",
  "left-[42%] top-[22%]",
  "left-[57%] top-[12%]",
  "left-[68%] top-[36%]",
  "left-[79%] top-[17%]",
  "left-[91%] top-[29%]",
] as const;

export default async function AdminLoginPage() {
  const session = await getServerAdminSession();

  if (session) {
    redirect("/admin");
  }

  return (
    <section className="relative isolate min-h-screen overflow-hidden border-y border-cyan-300/10 bg-[#050714] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_20%,rgba(34,211,238,0.09),transparent_28%),radial-gradient(circle_at_82%_82%,rgba(49,83,103,0.14),transparent_32%),linear-gradient(180deg,#07101f_0%,#050714_68%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(rgba(103,232,249,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.09)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]"
      />

      {stars.map((position, index) => (
        <span
          aria-hidden="true"
          className={`absolute -z-10 size-1 bg-cyan-100/70 shadow-[0_0_8px_rgba(165,243,252,0.5)] ${position} ${index % 3 === 0 ? "size-1.5" : ""}`}
          key={position}
        />
      ))}

      <div className="mx-auto grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-14">
        <div className="mx-auto max-w-xl lg:mx-0">
          <div className="mb-7 inline-flex items-center gap-2 rounded-[3px] border border-[#315467] bg-[#0b1726]/90 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.18em] text-[#9fdce1] uppercase shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]">
            <span
              aria-hidden="true"
              className="size-2 bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.55)]"
            />
            Editorial channel / secure
          </div>

          <p className="font-mono text-xs font-bold tracking-[0.22em] text-[#6ea8b0] uppercase">
            HayronHgh · Content Operations
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-[#f3f6ff] sm:text-5xl sm:leading-[1.08]">
            編輯作業控制台
          </h1>
          <p className="mt-5 max-w-lg text-base leading-8 text-[#aeb9cc] sm:text-lg">
            登入後管理文章草稿、預覽與發布狀態。每次操作都會沿用現有的
            Markdown 內容流程與權限規則。
          </p>

          <div
            aria-hidden="true"
            className="mt-9 hidden overflow-hidden rounded-[4px] border border-[#26344d] bg-[#070d19]/90 font-mono text-xs shadow-[inset_0_0_0_1px_#111b2d] sm:block"
          >
            <div className="flex h-9 items-center gap-2 border-b border-[#26344d] bg-[#101827] px-3">
              <span className="size-2 bg-[#c79658]" />
              <span className="size-2 bg-[#6ea8b0]" />
              <span className="size-2 bg-[#405434]" />
              <span className="ml-2 text-[#8795b2]">editorial-ops.log</span>
            </div>
            <div className="space-y-2 px-4 py-4 text-[#7f8ca8]">
              <p>
                <span className="text-[#8ed2d8]">01:AUTH</span> 等候身分驗證
              </p>
              <p>
                <span className="text-[#8ed2d8]">02:ROLE</span> 載入編輯權限
              </p>
              <p>
                <span className="text-[#8ed2d8]">03:SYNC</span> 連接文章工作區
              </p>
            </div>
          </div>
        </div>

        <PixelCard
          accent="cyan"
          className="mx-auto w-full max-w-md border-[#315467] bg-[#0b1220]/95 p-5! shadow-[inset_0_0_0_1px_#111b2d,0_20px_50px_rgba(0,0,0,0.38),0_0_34px_rgba(34,211,238,0.08)] sm:p-7!"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[#26344d] pb-5">
            <div>
              <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-[#6ea8b0] uppercase">
                Authorized personnel
              </p>
              <h2 className="mt-2 text-2xl font-extrabold text-[#eef3ff]">
                後台安全登入
              </h2>
            </div>
            <div
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-[4px] border border-[#315467] bg-[#101d2d] shadow-[inset_0_-2px_0_#050914]"
            >
              <span className="relative mt-1 h-4 w-5 border-2 border-[#8ed2d8] before:absolute before:-top-3 before:left-1/2 before:h-3 before:w-3 before:-translate-x-1/2 before:rounded-t-full before:border-2 before:border-b-0 before:border-[#8ed2d8]" />
            </div>
          </div>

          <AdminLoginForm />

          <p className="mt-6 border-t border-[#26344d] pt-5 text-xs leading-6 text-[#74819d]">
            工作階段使用 HttpOnly 安全 Cookie；請勿在共用裝置儲存登入資訊。
          </p>
        </PixelCard>
      </div>
    </section>
  );
}
