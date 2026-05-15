/**
 * Cloudinary URL transformer.
 *
 * Cloudinary serves images with long-cache headers, so the first hit warms
 * the browser + CDN cache and subsequent navigations are near-instant.
 * The default served URL however is the original-resolution upload — which
 * for a 200KB company logo means ~10× more bytes than the rendered size
 * needs. Inserting `/upload/f_auto,q_auto,w_<width>/` into the path tells
 * Cloudinary to deliver an auto-format + auto-quality + resized variant,
 * typically cutting weight 60-90%.
 *
 * No-op for non-Cloudinary URLs (local /uploads, external sources, missing).
 */
export function optimizedCloudinaryUrl(
  url: string | undefined | null,
  opts: { width?: number; height?: number; quality?: 'auto' | number; crop?: 'fill' | 'fit' | 'limit' } = {},
): string | undefined {
  if (!url || typeof url !== 'string') return url ?? undefined;
  if (!url.includes('res.cloudinary.com')) return url;
  // Only skip if the URL already has f_auto applied (the most important
  // transform). A URL with just q_auto or just w_X should still get f_auto
  // injected so we don't ship JPEGs when AVIF/WebP is available.
  if (/\/upload\/[^/]*\bf_auto\b[^/]*\//.test(url)) return url;
  const { width, height, quality = 'auto', crop = 'fill' } = opts;
  const transforms = [
    'f_auto',
    `q_${quality}`,
    width ? `w_${width}` : null,
    height ? `h_${height}` : null,
    width || height ? `c_${crop}` : null,
  ].filter(Boolean).join(',');
  return url.replace('/upload/', `/upload/${transforms}/`);
}
