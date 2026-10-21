/**
 * True when this code is running on Netlify (the hosted site), false on a
 * laptop. NETLIFY=true only exists during Netlify's *build*; deployed
 * functions get SITE_ID / SITE_NAME / URL at runtime instead (Netlify docs,
 * "Environment variables and functions"). NETLIFY is kept for code that
 * runs at build time.
 */
export function onNetlify(): boolean {
  return Boolean(process.env.SITE_ID || process.env.NETLIFY);
}
