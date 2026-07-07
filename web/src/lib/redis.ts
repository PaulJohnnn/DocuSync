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
let _mockRedis: any = null;

function getMockRedis() {
  if (_mockRedis) return _mockRedis;
  
  // A simple in-memory Map to act as Redis for local dev
  const store = new Map<string, any>();
  console.warn('[DocuSync] Upstash Redis not configured. Using in-memory fallback for Matchmaker.');
  
  _mockRedis = {
    get: async (key: string) => store.get(key) || null,
    set: async (key: string, value: any, options?: any) => { store.set(key, value); return 'OK'; },
    del: async (key: string) => { store.delete(key); return 1; },
    keys: async (pattern: string) => Array.from(store.keys()).filter(k => k.includes(pattern.replace('*', ''))),
  };
  return _mockRedis;
}

function getRedis(): any {
  if (_redis) return _redis;
  if (_mockRedis) return _mockRedis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || url.startsWith('PASTE_')) {
    return getMockRedis();
  }

  _redis = new Redis({ url, token });
  return _redis;
}

/**
 * Proxy object — transparently forwards every method call to the lazy client.
 * Import this just like before: `import { redis } from '@/lib/redis'`
 */
export const redis = new Proxy({} as any, {
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
