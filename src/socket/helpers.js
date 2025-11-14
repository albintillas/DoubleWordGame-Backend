const { PROMPT_TYPE } = require("../game/constants");

const broadcastLobbyState = (io, lobbyManager, lobby) => {
  if (!lobby) {
    return;
  }

  lobby.players.forEach((_, playerId) => {
    const payload = lobbyManager.serializeLobbyForPlayer(lobby.code, playerId);
    if (!payload) {
      return;
    }

    io.to(playerId).emit("lobby:state", payload);
  });
};

const notifyRoundStart = (io, lobbyManager, lobby, round) => {
  if (!lobby || !round) {
    return;
  }

  const submissionTimeoutMs = lobbyManager.config?.submissionTimeoutMs ?? null;
  const rawRemainingMs = lobbyManager.getRoundTimeRemaining(lobby);
  const timeRemainingMs =
    typeof rawRemainingMs === "number" ? rawRemainingMs : null;
  const startedAt = round.startedAt ?? null;
  const parsedStartedAt =
    startedAt && !Number.isNaN(Date.parse(startedAt))
      ? Date.parse(startedAt)
      : null;
  const deadline =
    parsedStartedAt !== null && submissionTimeoutMs
      ? new Date(parsedStartedAt + submissionTimeoutMs).toISOString()
      : null;

  const teamPlayers = lobbyManager.getTeamPlayers(
    lobby.code,
    round.activeTeamId
  );
  teamPlayers.forEach((player) => {
    io.to(player.id).emit("round:prompt", {
      number: round.number,
      activeTeamId: round.activeTeamId,
      prompt: round.prompt,
      startedAt,
      submissionTimeoutMs,
      deadline,
      timeRemainingMs,
    });
  });

  io.to(lobby.code).emit("round:started", {
    number: round.number,
    activeTeamId: round.activeTeamId,
    promptType: round.prompt.type,
    promptValue:
      round.prompt.type === PROMPT_TYPE.WORD_PAIR
        ? [...round.prompt.value]
        : null,
    startedAt,
    submissionTimeoutMs,
    deadline,
    timeRemainingMs,
  });
};

const emitRoundCompleted = (io, lobbyCode, roundSummary) => {
  if (!roundSummary) {
    return;
  }

  io.to(lobbyCode).emit("round:completed", roundSummary);
};

const emitGameEnded = (io, lobbyCode, gameSummary) => {
  io.to(lobbyCode).emit("game:ended", gameSummary);
};

const emitPlayerDisconnected = (io, lobbyCode, playerId) => {
  io.to(lobbyCode).emit("player:disconnected", { playerId });
};

module.exports = {
  broadcastLobbyState,
  notifyRoundStart,
  emitRoundCompleted,
  emitGameEnded,
  emitPlayerDisconnected,
};
