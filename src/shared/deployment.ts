export function deploymentOrigin(): string | undefined {
  const configured = process.env['PUBLIC_ORIGIN'];
  const vercelHost = process.env['VERCEL_URL'];
  const value =
    configured ?? (vercelHost ? `https://${vercelHost}` : undefined);
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'PUBLIC_ORIGIN must be an HTTPS origin without credentials, path, query or fragment.',
    );
  return url.origin;
}
