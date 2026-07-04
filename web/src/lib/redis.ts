import { Redis } from '@upstash/redis'

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Throw a more helpful error if env vars are missing
if (!redisUrl || !redisToken) {
  console.warn("UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing from environment variables. Redis calls will fail.");
}

export const redis = new Redis({
  url: redisUrl || '',
  token: redisToken || '',
})

export default redis;
