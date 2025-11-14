const buildPayload = (level, message, meta = {}) => ({
  level,
  message,
  timestamp: new Date().toISOString(),
  ...meta,
});

const log = (level, message, meta) => {
  const payload = buildPayload(level, message, meta);
  if (level === "error") {
    console.error(payload);
    return;
  }

  console.log(payload);
};

module.exports = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
  debug: (message, meta) => log("debug", message, meta),
};
