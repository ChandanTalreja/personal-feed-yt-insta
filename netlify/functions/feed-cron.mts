import type { Config } from "@netlify/functions";

// Runs on Netlify's scheduler every 6 hours and pings the app's cron
// endpoint, which fetches new uploads for every active channel.
// process.env.URL is the site's canonical URL, provided by Netlify.
const feedCron = async () => {
  const base = process.env.URL;
  if (!base) {
    console.error("feed-cron: process.env.URL is not set");
    return;
  }
  const res = await fetch(`${base}/api/cron`, {
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  const body = await res.text();
  console.log(`feed-cron: ${res.status} ${body.slice(0, 500)}`);
};

export default feedCron;

export const config: Config = {
  schedule: "0 */6 * * *",
};
