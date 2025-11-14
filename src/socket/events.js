const logger = require("../utils/logger");
const {
  broadcastLobbyState,
  notifyRoundStart,
  emitRoundCompleted,
  emitGameEnded,
  emitPlayerDisconnected,
} = require("./helpers");

const respond = (ack, payload) => {
  if (typeof ack === "function") {
    ack(payload);
  }
};

const registerSocketEvents = (io, socket, lobbyManager) => {
  socket.on("lobby:create", ({ playerName }, ack) => {
    try {
      const { lobby, player } = lobbyManager.createLobby({
        socketId: socket.id,
        playerName,
      });

      socket.data.lobbyCode = lobby.code;
      socket.data.playerName = player.name;
      socket.join(lobby.code);

      broadcastLobbyState(io, lobbyManager, lobby);
      respond(ack, {
        ok: true,
        lobbyCode: lobby.code,
        playerId: player.id,
        teamId: player.teamId,
      });
    } catch (error) {
      logger.error("Failed to create lobby", { error: error.message });
      respond(ack, { ok: false, message: error.message });
    }
  });

  socket.on("lobby:join", ({ lobbyCode, playerName }, ack) => {
    try {
      const { lobby, player } = lobbyManager.joinLobby({
        socketId: socket.id,
        playerName,
        lobbyCode,
      });

      socket.data.lobbyCode = lobby.code;
      socket.data.playerName = player.name;
      socket.join(lobby.code);

      broadcastLobbyState(io, lobbyManager, lobby);
      respond(ack, {
        ok: true,
        playerId: player.id,
        teamId: player.teamId,
      });
    } catch (error) {
      logger.error("Failed to join lobby", { lobbyCode, error: error.message });
      respond(ack, { ok: false, message: error.message });
    }
  });

  socket.on("lobby:leave", (_, ack) => {
    try {
      const result = lobbyManager.leaveLobby(socket.id);
      if (result) {
        socket.leave(result.lobbyCode);

        if (result.lobby) {
          broadcastLobbyState(io, lobbyManager, result.lobby);
        }
      }

      delete socket.data.lobbyCode;
      respond(ack, { ok: true });
    } catch (error) {
      logger.error("Failed to leave lobby", { error: error.message });
      respond(ack, { ok: false, message: error.message });
    }
  });

  socket.on("game:start", (_, ack) => {
    const lobbyCode = socket.data.lobbyCode;

    try {
      if (!lobbyCode) {
        throw new Error("You must join a lobby before starting a game.");
      }

      const { lobby, round } = lobbyManager.startGame(lobbyCode);
      broadcastLobbyState(io, lobbyManager, lobby);
      notifyRoundStart(io, lobbyManager, lobby, round);
      respond(ack, { ok: true, roundNumber: round.number });
    } catch (error) {
      logger.error("Failed to start game", { lobbyCode, error: error.message });
      respond(ack, { ok: false, message: error.message });
    }
  });

  socket.on("round:submitWord", ({ word }, ack) => {
    try {
      const result = lobbyManager.submitWord({
        socketId: socket.id,
        word,
      });

      if (result.alreadySubmitted) {
        respond(ack, { ok: true, status: "already-submitted" });
        return;
      }

      if (result.pending) {
        broadcastLobbyState(io, lobbyManager, result.lobby);
        respond(ack, { ok: true, status: "pending" });
        return;
      }

      const { lobby, roundSummary, nextRound, gameEnded, gameSummary } = result;

      if (roundSummary) {
        emitRoundCompleted(io, lobby.code, roundSummary);
      }

      broadcastLobbyState(io, lobbyManager, lobby);

      if (gameEnded) {
        emitGameEnded(io, lobby.code, gameSummary);
        respond(ack, { ok: true, status: "game-ended" });
        return;
      }

      if (nextRound) {
        notifyRoundStart(io, lobbyManager, lobby, nextRound);
      }

      respond(ack, { ok: true, status: "accepted" });
    } catch (error) {
      logger.error("Failed to submit word", { error: error.message });
      respond(ack, { ok: false, message: error.message });
    }
  });

  socket.on("disconnect", () => {
    const result = lobbyManager.handleDisconnect(socket.id);

    if (result && result.lobby) {
      broadcastLobbyState(io, lobbyManager, result.lobby);
      emitPlayerDisconnected(io, result.lobby.code, socket.id);
    }
  });
};

module.exports = registerSocketEvents;
