import { loadAdminConfig } from "@/lib/admin/config";
import { articleStore } from "@/lib/admin/articles/store";
import { assertSafeArticleRoutePath } from "@/lib/admin/articles/slug";
import {
  AdminApiError,
  apiSuccess,
  readJsonBody,
  toApiErrorResponse,
} from "@/lib/admin/http";
import { isSameOriginRequest } from "@/lib/admin/origin";
import { updateArticleRequestSchema } from "@/lib/admin/schemas";
import { requireRequestSession } from "@/lib/admin/session";
import { assertCmsWriteEnabled } from "@/lib/admin/write-policy";

type AdminPostRouteContext = {
  params: Promise<{
    slug: string[];
  }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: AdminPostRouteContext) {
  try {
    const config = loadAdminConfig();
    requireRequestSession(request, ["admin", "editor"], config);
    assertSafeArticleRoutePath(request);
    const { slug } = await params;

    const requestedViews = new URL(request.url).searchParams.getAll("view");

    if (
      requestedViews.length > 1 ||
      (requestedViews.length === 1 && requestedViews[0] !== "revision")
    ) {
      throw new AdminApiError(400, "invalid_view", "不支援這個文章檢視模式。");
    }

    if (requestedViews[0] === "revision") {
      return apiSuccess(await articleStore.readRevision(slug));
    }

    return apiSuccess({ article: await articleStore.read(slug) });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: AdminPostRouteContext) {
  try {
    const config = loadAdminConfig();

    if (!isSameOriginRequest(request, config.allowedOrigins)) {
      throw new AdminApiError(403, "invalid_origin", "要求來源未通過驗證。");
    }

    const session = requireRequestSession(request, ["admin", "editor"], config);
    assertCmsWriteEnabled(config);
    assertSafeArticleRoutePath(request);
    const { slug } = await params;
    const body = await readJsonBody(request, updateArticleRequestSchema);
    const { saveMode, ...articleInput } = body;
    const article = await articleStore.update(slug, articleInput, session.user.role, saveMode);
    return apiSuccess({ article });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: AdminPostRouteContext) {
  try {
    const config = loadAdminConfig();

    if (!isSameOriginRequest(request, config.allowedOrigins)) {
      throw new AdminApiError(403, "invalid_origin", "要求來源未通過驗證。");
    }

    const session = requireRequestSession(request, ["admin"], config);
    assertCmsWriteEnabled(config);
    assertSafeArticleRoutePath(request);
    const { slug } = await params;
    const archive = await articleStore.archive(slug, session.user.role);
    return apiSuccess({ archive });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
