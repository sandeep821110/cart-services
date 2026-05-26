// ...new file...
const levels = ["error", "warn", "info", "debug"];

const format = (level, args) => {
  const timestamp = new Date().toISOString();
  const message = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
    .join(" ");
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
};

const logger = {};
levels.forEach((level) => {
  logger[level] = (...args) => {
    const out = format(level, args);
    if (level === "error") {
      console.error(out);
    } else if (level === "warn") {
      console.warn(out);
    } else {
      console.log(out);
    }
  };
});

export default logger;
// ...new file...