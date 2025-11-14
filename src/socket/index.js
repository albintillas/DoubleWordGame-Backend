const { Server } = require("socket.io");
const logger = require("../utils/logger");
const registerSocketEvents = require("./events");
const {
  broadcastLobbyState,
  notifyRoundStart,
  emitRoundCompleted,
  emitGameEnded,
} = require("./helpers");

const setupSocketServer = (httpServer, config, lobbyManager) => {
  const corsOrigins = config.allowedOrigins.length
    ? config.allowedOrigins
    : "*";

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  lobbyManager.removeAllListeners("roundTimeout");
  lobbyManager.on(
    "roundTimeout",
    ({ lobby, roundSummary, nextRound, gameEnded, gameSummary }) => {
      if (!lobby) {
        return;
      }

      if (roundSummary) {
        emitRoundCompleted(io, lobby.code, roundSummary);
      }

      broadcastLobbyState(io, lobbyManager, lobby);

      if (gameEnded) {
        emitGameEnded(io, lobby.code, gameSummary);
        return;
      }

      if (nextRound) {
        notifyRoundStart(io, lobbyManager, lobby, nextRound);
      }
    }
  );

  io.on("connection", (socket) => {
    const origin = socket.handshake.headers.origin || "unknown";
    logger.info("socket connected", {
      socketId: socket.id,
      origin,
      transport: socket.conn.transport?.name,
    });

    socket.data = socket.data || {};
    registerSocketEvents(io, socket, lobbyManager);

    socket.on("disconnect", (reason) => {
      logger.info("socket disconnected", {
        socketId: socket.id,
        reason,
      });
    });
  });

  return io;
};

module.exports = setupSocketServer;
