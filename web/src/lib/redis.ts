import { Redis } from '@upstash/redis';

/**
 * Lazy Redis client — instantiated on first use, not at module load.
 *
 * This is critical for Next.js builds: during `next build`, the server
 * tries to collect routes at build time. If the Redis client is created
 * eagerly at the top level, it throws a UrlError when the env var is a
 * placeholder (like during local dev or CI without secrets).
 *
 * By creating the client inside `getRedis()` on first call, the build
 * completes safely and the client is only initialised when a real HTTP
 * request hits an API route at runtime.
 */

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || url.startsWith('PASTE_')) {
    throw new Error(
      '[DocuSync] Upstash Redis is not configured.\n' +
      'Open web/.env.local and set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.\n' +
      'Get these values from https://console.upstash.com → your database → REST API tab.'
    );
  }

  _redis = new Redis({ url, token });
  return _redis;
}

/**
 * Proxy object — transparently forwards every method call to the lazy client.
 * Import this just like before: `import { redis } from '@/lib/redis'`
 */
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedis();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export default redis;
