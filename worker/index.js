// Daily keep-alive for the free Supabase plan: a tiny read keeps the project from pausing after 7 idle days.
// Runs from the cron trigger in wrangler.jsonc. The website itself is served as static files from ./dist.
async function ping(env) {
  const url = `${env.SUPABASE_URL}/rest/v1/products?select=id&limit=1`;
  const r = await fetch(url, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
  console.log('supabase keepalive status', r.status);
  return r.status;
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(ping(env)); },
  // Open https://<your-site>/__keepalive once to test it by hand.
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/__keepalive') return new Response('Supabase status: ' + (await ping(env)));
    return env.ASSETS.fetch(request);
  },
};
