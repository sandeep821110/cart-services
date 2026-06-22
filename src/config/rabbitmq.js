import amqp from "amqplib";
import logger from "../utils/logger.js";

let channel;
let connection;
let isConnected = false;

export const isRabbitMQConnected = () => isConnected && channel !== null;

export const getRabbitMQStatus = () => ({
  connected: isConnected,
  available: isRabbitMQConnected(),
  hasConnection: connection !== null,
  hasChannel: channel !== null,
});

export const checkRabbitMQHealth = async () => {
  if (!isRabbitMQConnected()) {
    return { status: "disconnected", message: "RabbitMQ not connected", connected: false };
  }
  try {
    const healthQueue = `health-check-${Date.now()}`;
    await channel.assertQueue(healthQueue, { exclusive: true });
    await channel.deleteQueue(healthQueue);
    return { status: "healthy", message: "RabbitMQ is operational", connected: true };
  } catch (error) {
    return { status: "unhealthy", message: error.message, connected: isConnected };
  }
};

export const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672", {
      connectionTimeout: 10000,
      socketProperties: { noDelay: true },
    });

    channel = await connection.createChannel();

    await channel.assertQueue("cartQueue", { durable: true });

    isConnected = true;
    logger.info("RabbitMQ connected and queue asserted");

    connection.on("error", (err) => {
      isConnected = false;
      logger.error("RabbitMQ connection error:", err.message);
    });

    connection.on("close", () => {
      isConnected = false;
      logger.warn("RabbitMQ connection closed");
    });

    return { channel, connection };
  } catch (err) {
    isConnected = false;
    logger.error("Failed to connect to RabbitMQ:", err.message);
    logger.warn("Continuing without RabbitMQ — events will not be published");
    channel = null;
    connection = null;
    return { channel: null, connection: null };
  }
};

export const publishEvent = async (data) => {
  if (!channel) {
    logger.error("RabbitMQ channel not available - cannot publish event");
    return false;
  }

  try {
    const published = channel.sendToQueue(
      "cartQueue",
      Buffer.from(JSON.stringify(data)),
      { persistent: true }
    );

    if (!published) {
      logger.warn("Message not published - queue full or closed");
      return false;
    }

    logger.debug("Event published to RabbitMQ", { type: data.type });
    return true;
  } catch (err) {
    logger.error("Error publishing event to RabbitMQ:", err.message);
    return false;
  }
};

export const closeRabbitMQ = async () => {
  try {
    if (channel) {
      await channel.close();
      logger.info("RabbitMQ channel closed");
    }
    if (connection) {
      await connection.close();
      logger.info("RabbitMQ connection closed");
    }
  } catch (err) {
    logger.error("Error closing RabbitMQ connection:", err.message);
  }
};

export const getChannel = () => channel;
