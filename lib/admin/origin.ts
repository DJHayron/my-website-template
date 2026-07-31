export function isSameOriginRequest(
  request: Request,
  additionalAllowedOrigins: ReadonlySet<string> = new Set(),
) {
  const originHeader = request.headers.get("origin");

  if (!originHeader || request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  try {
    const requestUrl = new URL(request.url);
    const requestOrigin = requestUrl.origin;
    const host = request.headers.get("host")?.trim();
    const hostOrigin = host ? `${requestUrl.protocol}//${host}` : null;
    const origin = new URL(originHeader);

    if (origin.origin !== originHeader.replace(/\/$/, "")) {
      return false;
    }

    return (
      origin.origin === requestOrigin ||
      origin.origin === hostOrigin ||
      additionalAllowedOrigins.has(origin.origin)
    );
  } catch {
    return false;
  }
}
