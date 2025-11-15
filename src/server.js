const http = require("http");

const app = require("./app");
const config = require("./config/env");
const LobbyManager = require("./game/lobbyManager");
const setupSocketServer = require("./socket");
const logger = require("./utils/logger");

const lobbyManager = new LobbyManager(config);
const server = http.createServer(app);

const io = setupSocketServer(server, config, lobbyManager);

app.locals.lobbyManager = lobbyManager;
app.locals.config = config;
app.locals.io = io;

// Render provides the port, or we default to config.port for local testing
const PORT = process.env.PORT || config.port;

server.listen(PORT, () => {
  logger.info("Server listening", { port: PORT });
});

const shutdown = (signal) => {
  logger.info("Received shutdown signal", { signal });
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn("Forcing shutdown");
    process.exit(1);
  }, 5000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
