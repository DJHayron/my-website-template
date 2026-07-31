import type { AdminConfig } from "@/lib/admin/config";
import { AdminApiError } from "@/lib/admin/http";

export function assertCmsWriteEnabled(config: AdminConfig) {
  if (!config.writeEnabled) {
    throw new AdminApiError(
      503,
      "write_disabled",
      "此部署目前以唯讀模式執行，無法修改文章。",
    );
  }
}
