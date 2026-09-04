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

import fs from 'fs';
import path from 'path';

function getMockRedis() {
  if (_mockRedis) return _mockRedis;
  
  const mockFilePath = path.join(process.cwd(), '.docusync_redis_mock.json');
  console.warn('[DocuSync] Upstash Redis not configured. Using file-backed fallback for Matchmaker.');
  
  function readStore(): Record<string, any> {
    try {
      if (fs.existsSync(mockFilePath)) {
        const data = fs.readFileSync(mockFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Failed to read mock redis file', e);
    }
    return {};
  }

  function writeStore(store: Record<string, any>) {
    try {
      fs.writeFileSync(mockFilePath, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
      console.warn('Failed to write mock redis file', e);
    }
  }

  _mockRedis = {
    get: async (key: string) => {
      const store = readStore();
      return store[key] || null;
    },
    set: async (key: string, value: any, _options?: any) => { 
      const store = readStore();
      store[key] = value;
      writeStore(store);
      return 'OK'; 
    },
    del: async (key: string) => { 
      const store = readStore();
      delete store[key];
      writeStore(store);
      return 1; 
    },
    keys: async (pattern: string) => {
      const store = readStore();
      return Object.keys(store).filter(k => k.includes(pattern.replace('*', '')));
    },
    mget: async (...keys: string[]) => {
      const store = readStore();
      // Upstash mget accepts an array of keys, which might be passed as multiple arguments or an array in the first argument
      const actualKeys = Array.isArray(keys[0]) ? keys[0] : keys;
      return actualKeys.map(k => store[k] || null);
    },
    rpush: async (key: string, ...values: any[]) => {
      const store = readStore();
      if (!store[key]) store[key] = [];
      if (!Array.isArray(store[key])) store[key] = [store[key]];
      store[key].push(...values);
      writeStore(store);
      return store[key].length;
    },
    lrange: async (key: string, start: number, end: number) => {
      const store = readStore();
      const list = store[key] || [];
      if (!Array.isArray(list)) return [];
      if (end === -1) return list.slice(start);
      return list.slice(start, end + 1);
    },
    expire: async (_key: string, _seconds: number) => {
      // Mock expire (file-backed mock doesn't run background GC)
      return 1;
    },
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
