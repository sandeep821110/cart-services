import Redis from "ioredis";

let isRedisConnected = false;

const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => console.log("Redis connected"));
redis.on("ready", () => {
  isRedisConnected = true;
  console.log("Redis ready");
});
redis.on("error", (err) => {
  isRedisConnected = false;
  console.log("Redis Error", err);
});
redis.on("close", () => {
  isRedisConnected = false;
});

export const isRedisAvailable = () => isRedisConnected && redis.status === "ready";

export const getRedisStatus = () => ({
  connected: isRedisConnected,
  available: isRedisAvailable(),
  status: redis.status,
});

export const checkRedisHealth = async () => {
  if (!redis || redis.status !== "ready") {
    return { status: "unhealthy", message: "Redis client not ready", connected: isRedisConnected };
  }
  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Ping timeout")), 3000)
      ),
    ]);
    return { status: "healthy", message: pong, connected: isRedisConnected };
  } catch (error) {
    return { status: "unhealthy", message: error.message, connected: isRedisConnected };
  }
};

export default redis;
