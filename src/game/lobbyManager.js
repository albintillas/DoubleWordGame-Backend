const { randomInt } = require("crypto");
const { EventEmitter } = require("events");

const { generateCode } = require("../utils/codeGenerator");
const logger = require("../utils/logger");
const { createLobby, createPlayer } = require("./models");
const {
  TEAM_SIZE,
  MAX_TEAMS,
  GAME_STATUS,
  ROUND_STATUS,
  PROMPT_TYPE,
} = require("./constants");
const { words } = require("./wordList");

const sanitizeWord = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const clonePrompt = (prompt) => ({
  type: prompt.type,
  value: Array.isArray(prompt.value) ? [...prompt.value] : prompt.value,
});

class LobbyManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      pointsToWin: config.pointsToWin,
      maxRounds: config.maxRounds,
      submissionTimeoutMs: config.submissionTimeoutMs,
      teamSize: TEAM_SIZE,
      maxTeams: MAX_TEAMS,
    };

    this.lobbies = new Map();
    this.playerToLobby = new Map();
    this.roundTimers = new Map();
    this.persistenceAdapter = null;
  }

  setPersistenceAdapter(adapter) {
    this.persistenceAdapter = adapter;
  }

  persistLobbySnapshot(lobby) {
    if (
      !this.persistenceAdapter ||
      typeof this.persistenceAdapter.saveLobby !== "function"
    ) {
      return;
    }

    Promise.resolve()
      .then(() => this.persistenceAdapter.saveLobby(lobby))
      .catch((error) => {
        logger.error("Failed to persist lobby snapshot", {
          lobbyCode: lobby.code,
          error: error.message,
        });
      });
  }

  removeLobbySnapshot(lobbyCode) {
    if (
      !this.persistenceAdapter ||
      typeof this.persistenceAdapter.deleteLobby !== "function"
    ) {
      return;
    }

    Promise.resolve()
      .then(() => this.persistenceAdapter.deleteLobby(lobbyCode))
      .catch((error) => {
        logger.error("Failed to remove lobby snapshot", {
          lobbyCode,
          error: error.message,
        });
      });
  }

  createLobby({ socketId, playerName }) {
    if (!playerName || !playerName.trim()) {
      throw new Error("Player name is required to create a lobby.");
    }

    const code = generateCode(new Set(this.lobbies.keys()));
    const lobby = createLobby({
      code,
      config: this.config,
      hostId: socketId,
    });

    const hostPlayer = createPlayer({
      id: socketId,
      name: playerName,
      isHost: true,
    });
    hostPlayer.teamId = lobby.teams[0].id;
    lobby.players.set(socketId, hostPlayer);
    lobby.teams[0].players.push(socketId);
    lobby.turnOrder = lobby.teams.map((team) => team.id);

    this.lobbies.set(code, lobby);
    this.playerToLobby.set(socketId, code);

    logger.info("Lobby created", { code, hostId: socketId });
    this.persistLobbySnapshot(lobby);

    return { lobby, player: hostPlayer };
  }

  joinLobby({ socketId, playerName, lobbyCode }) {
    const lobby = this.lobbies.get(lobbyCode);

    if (!lobby) {
      throw new Error("Lobby not found.");
    }

    if (lobby.status !== GAME_STATUS.WAITING) {
      throw new Error("Game already in progress.");
    }

    if (lobby.players.has(socketId)) {
      return { lobby, player: lobby.players.get(socketId) };
    }

    if (!playerName || !playerName.trim()) {
      throw new Error("Player name is required to join a lobby.");
    }

    const availableTeam = lobby.teams.find(
      (team) => team.players.length < this.config.teamSize
    );

    if (!availableTeam) {
      throw new Error("Lobby is full.");
    }

    const player = createPlayer({ id: socketId, name: playerName });
    player.teamId = availableTeam.id;

    lobby.players.set(socketId, player);
    availableTeam.players.push(socketId);
    lobby.updatedAt = new Date().toISOString();
    this.playerToLobby.set(socketId, lobby.code);

    logger.info("Player joined lobby", {
      lobbyCode,
      playerId: socketId,
      teamId: player.teamId,
    });

    this.persistLobbySnapshot(lobby);

    return { lobby, player };
  }

  leaveLobby(socketId) {
    const lobbyCode = this.playerToLobby.get(socketId);
    if (!lobbyCode) {
      return null;
    }

    const lobby = this.lobbies.get(lobbyCode);
    if (!lobby) {
      this.playerToLobby.delete(socketId);
      return null;
    }

    const player = lobby.players.get(socketId);
    if (!player) {
      this.playerToLobby.delete(socketId);
      return null;
    }

    const team = lobby.teams.find((candidate) =>
      candidate.players.includes(socketId)
    );
    if (team) {
      team.players = team.players.filter((id) => id !== socketId);
    }

    lobby.players.delete(socketId);
    this.playerToLobby.delete(socketId);

    if (player.isHost) {
      this.promoteNextHost(lobby);
    }

    if (lobby.players.size === 0) {
      this.clearRoundTimeout(lobbyCode);
      this.lobbies.delete(lobbyCode);
      logger.info("Lobby removed after last player left", { lobbyCode });
      this.removeLobbySnapshot(lobbyCode);
      return { lobbyCode, lobby: null, removed: true };
    }

    this.handleGameStateAfterDeparture(lobby);
    lobby.updatedAt = new Date().toISOString();

    logger.info("Player left lobby", { lobbyCode, playerId: socketId });
    this.persistLobbySnapshot(lobby);
    return { lobbyCode, lobby, removed: false, playerId: socketId };
  }

  promoteNextHost(lobby) {
    const nextHostEntry = [...lobby.players.values()][0];

    if (!nextHostEntry) {
      lobby.hostId = null;
      return;
    }

    nextHostEntry.isHost = true;
    lobby.hostId = nextHostEntry.id;
  }

  handleGameStateAfterDeparture(lobby) {
    if (lobby.status !== GAME_STATUS.IN_PROGRESS) {
      return;
    }

    const incompleteTeam = lobby.teams.some(
      (team) => team.players.length < this.config.teamSize
    );

    if (incompleteTeam) {
      lobby.status = GAME_STATUS.WAITING;
      lobby.currentRound = null;
      lobby.gameSummary = null;
      this.clearRoundTimeout(lobby.code);
      logger.warn("Game paused due to missing players", {
        lobbyCode: lobby.code,
      });
    }
  }

  handleDisconnect(socketId) {
    return this.leaveLobby(socketId);
  }

  clearRoundTimeout(lobbyCode) {
    const existing = this.roundTimers.get(lobbyCode);
    if (existing) {
      clearTimeout(existing);
      this.roundTimers.delete(lobbyCode);
    }
  }

  scheduleRoundTimeout(lobby) {
    if (!lobby || this.config.submissionTimeoutMs <= 0) {
      return;
    }

    this.clearRoundTimeout(lobby.code);

    const timeout = setTimeout(() => {
      this.handleRoundTimeout(lobby.code);
    }, this.config.submissionTimeoutMs);

    timeout.unref?.();
    this.roundTimers.set(lobby.code, timeout);
  }

  handleRoundTimeout(lobbyCode) {
    const outcome = this.forceRoundFailure(lobbyCode, "timeout");
    if (!outcome) {
      return;
    }

    this.emit("roundTimeout", {
      lobby: outcome.lobby,
      roundSummary: outcome.roundSummary,
      nextRound: outcome.nextRound,
      gameEnded: outcome.gameEnded,
      gameSummary: outcome.gameSummary,
    });
  }

  forceRoundFailure(lobbyCode, failureReason = "timeout") {
    const lobby = this.lobbies.get(lobbyCode);

    if (
      !lobby ||
      lobby.status !== GAME_STATUS.IN_PROGRESS ||
      !lobby.currentRound
    ) {
      return null;
    }

    const activeTeam = lobby.teams.find(
      (team) => team.id === lobby.currentRound.activeTeamId
    );
    if (!activeTeam) {
      return null;
    }

    activeTeam.players.forEach((playerId) => {
      if (
        !Object.prototype.hasOwnProperty.call(
          lobby.currentRound.submissions,
          playerId
        )
      ) {
        lobby.currentRound.submissions[playerId] = null;
      }
    });

    return this.resolveRound(lobby, activeTeam, {
      forcedFailure: true,
      failureReason,
    });
  }

  getLobby(code) {
    return this.lobbies.get(code);
  }

  getLobbyForPlayer(socketId) {
    const lobbyCode = this.playerToLobby.get(socketId);
    return lobbyCode ? this.lobbies.get(lobbyCode) : null;
  }

  startGame(lobbyCode) {
    const lobby = this.lobbies.get(lobbyCode);

    if (!lobby) {
      throw new Error("Lobby not found.");
    }

    if (lobby.status !== GAME_STATUS.WAITING) {
      throw new Error("Game already started.");
    }

    const filledTeams = lobby.teams.filter(
      (team) => team.players.length === this.config.teamSize
    );

    if (filledTeams.length < 2) {
      throw new Error("At least two full teams are required to start.");
    }

    lobby.teams.forEach((team) => {
      team.score = 0;
    });

    lobby.turnOrder = filledTeams.map((team) => team.id);
    lobby.turnCursor = 0;
    lobby.status = GAME_STATUS.IN_PROGRESS;
    lobby.roundHistory = [];
    lobby.gameSummary = null;
    lobby.nextPrompt = null;
    lobby.wordChain = [];

    const nextRound = this.createNextRound(lobby);
    lobby.currentRound = nextRound;
    lobby.updatedAt = new Date().toISOString();
    this.scheduleRoundTimeout(lobby);
    this.persistLobbySnapshot(lobby);

    logger.info("Game started", { lobbyCode });

    return { lobby, round: nextRound };
  }

  submitWord({ socketId, word }) {
    const lobby = this.getLobbyForPlayer(socketId);

    if (
      !lobby ||
      lobby.status !== GAME_STATUS.IN_PROGRESS ||
      !lobby.currentRound
    ) {
      throw new Error("No active round.");
    }

    const player = lobby.players.get(socketId);

    if (!player) {
      throw new Error("Player not found.");
    }

    const round = lobby.currentRound;

    if (player.teamId !== round.activeTeamId) {
      throw new Error("It is not your turn.");
    }

    const cleanedWord = sanitizeWord(word);

    if (!cleanedWord) {
      throw new Error("Submitted word is invalid.");
    }

    if (round.submissions[player.id]) {
      return { lobby, round, alreadySubmitted: true };
    }

    round.submissions[player.id] = cleanedWord;

    const activeTeam = lobby.teams.find(
      (team) => team.id === round.activeTeamId
    );
    const allSubmitted = activeTeam.players.every(
      (id) => round.submissions[id]
    );

    if (!allSubmitted) {
      this.persistLobbySnapshot(lobby);
      return { lobby, round, pending: true };
    }

    return this.resolveRound(lobby, activeTeam);
  }

  resolveRound(lobby, activeTeam, options = {}) {
    const round = lobby.currentRound;
    this.clearRoundTimeout(lobby.code);

    const submissions = activeTeam.players.map((playerId) => ({
      playerId,
      playerName: lobby.players.get(playerId)?.name,
      word: Object.prototype.hasOwnProperty.call(round.submissions, playerId)
        ? round.submissions[playerId]
        : null,
    }));

    const submittedWords = submissions
      .map((entry) => entry.word)
      .filter((value) => typeof value === "string" && value.length);

    let success = false;
    if (
      !options.forcedFailure &&
      submittedWords.length === activeTeam.players.length
    ) {
      const anchor = submittedWords[0].toLowerCase();
      success = submittedWords.every((word) => word.toLowerCase() === anchor);
    }

    if (success) {
      activeTeam.score += 1;
    }

    const promptRecord = clonePrompt(round.prompt);

    lobby.roundHistory.push({
      number: round.number,
      teamId: activeTeam.id,
      teamName: activeTeam.name,
      prompt: promptRecord,
      submissions,
      success,
      failureReason: success ? null : options.failureReason || "mismatch",
      completedAt: new Date().toISOString(),
    });

    lobby.wordChain.push({ prompt: promptRecord, submissions });

    if (success) {
      lobby.nextPrompt = null;
    } else {
      lobby.nextPrompt =
        submittedWords.length === activeTeam.players.length
          ? {
              type: PROMPT_TYPE.WORD_PAIR,
              value: submissions.map((entry) => entry.word),
            }
          : null;
    }

    round.status = ROUND_STATUS.COMPLETED;
    round.completedAt = new Date().toISOString();
    round.failureReason = success ? null : options.failureReason || "mismatch";
    lobby.currentRound = null;

    const victory = this.hasTeamWon(activeTeam);
    const roundLimitReached =
      lobby.roundHistory.length >= this.config.maxRounds;

    if (victory || roundLimitReached) {
      lobby.status = GAME_STATUS.ENDED;
      lobby.gameSummary = this.buildGameSummary(lobby);
      lobby.updatedAt = new Date().toISOString();
      this.persistLobbySnapshot(lobby);
      this.clearRoundTimeout(lobby.code);

      logger.info("Game ended", {
        lobbyCode: lobby.code,
        victory,
        roundLimitReached,
      });

      return {
        lobby,
        roundSummary: this.buildRoundSummary(lobby, activeTeam, success),
        gameEnded: true,
        gameSummary: lobby.gameSummary,
      };
    }

    this.advanceTurn(lobby);
    const nextRound = this.createNextRound(lobby);
    lobby.currentRound = nextRound;
    lobby.updatedAt = new Date().toISOString();
    this.scheduleRoundTimeout(lobby);
    this.persistLobbySnapshot(lobby);

    return {
      lobby,
      roundSummary: this.buildRoundSummary(lobby, activeTeam, success),
      nextRound,
    };
  }

  buildRoundSummary(lobby, activeTeam, success) {
    const historyEntry = lobby.roundHistory[lobby.roundHistory.length - 1];

    return {
      number: historyEntry.number,
      teamId: activeTeam.id,
      teamName: activeTeam.name,
      success,
      prompt: historyEntry.prompt,
      submissions: historyEntry.submissions,
      failureReason: historyEntry.failureReason || null,
    };
  }

  hasTeamWon(team) {
    return team.score >= this.config.pointsToWin;
  }

  buildGameSummary(lobby) {
    const leaderboard = lobby.teams
      .map((team) => ({
        id: team.id,
        name: team.name,
        score: team.score,
      }))
      .sort((a, b) => b.score - a.score);

    const topScore = leaderboard[0]?.score ?? 0;
    const winners = leaderboard.filter((team) => team.score === topScore);

    return {
      leaderboard,
      winners,
      roundsPlayed: lobby.roundHistory.length,
      pointsToWin: this.config.pointsToWin,
    };
  }

  advanceTurn(lobby) {
    lobby.turnCursor = (lobby.turnCursor + 1) % lobby.turnOrder.length;
  }

  createNextRound(lobby) {
    const activeTeamId = lobby.turnOrder[lobby.turnCursor];
    const promptSource = lobby.nextPrompt
      ? lobby.nextPrompt
      : this.createHiddenWordPrompt();
    const prompt = clonePrompt(promptSource);
    lobby.nextPrompt = null;

    return {
      number: lobby.roundHistory.length + 1,
      activeTeamId,
      prompt,
      submissions: {},
      status: ROUND_STATUS.IN_PROGRESS,
      startedAt: new Date().toISOString(),
    };
  }

  createHiddenWordPrompt() {
    if (!Array.isArray(words) || words.length === 0) {
      return { type: PROMPT_TYPE.HIDDEN_WORD, value: "Mystery" };
    }

    const index = randomInt(words.length);
    return { type: PROMPT_TYPE.HIDDEN_WORD, value: words[index] };
  }

  serializeLobbyForPlayer(lobbyCode, playerId) {
    const lobby = this.lobbies.get(lobbyCode);
    if (!lobby) {
      return null;
    }

    const player = lobby.players.get(playerId);

    const teams = lobby.teams.map((team) => ({
      id: team.id,
      name: team.name,
      score: team.score,
      players: team.players
        .map((id) => lobby.players.get(id))
        .filter(Boolean)
        .map((teamPlayer) => ({
          id: teamPlayer.id,
          name: teamPlayer.name,
          isHost: teamPlayer.isHost,
        })),
    }));

    const currentRound = this.buildCurrentRoundView(lobby, player);

    return {
      code: lobby.code,
      status: lobby.status,
      hostId: lobby.hostId,
      teams,
      config: {
        pointsToWin: this.config.pointsToWin,
        maxRounds: this.config.maxRounds,
        teamSize: this.config.teamSize,
        submissionTimeoutMs: this.config.submissionTimeoutMs,
        maxTeams: this.config.maxTeams,
      },
      currentRound,
      roundHistory: lobby.roundHistory,
      gameSummary: lobby.gameSummary,
    };
  }

  buildCurrentRoundView(lobby, player) {
    const round = lobby.currentRound;
    if (!round) {
      return null;
    }

    const isActiveTeamMember = Boolean(
      player && player.teamId === round.activeTeamId
    );
    const prompt = this.buildPromptView(round.prompt, isActiveTeamMember);
    const activeTeam = lobby.teams.find(
      (team) => team.id === round.activeTeamId
    );

    const submissions = activeTeam.players.reduce((accumulator, playerId) => {
      const submitted = Boolean(round.submissions[playerId]);
      accumulator[playerId] = {
        submitted,
        word:
          isActiveTeamMember && submitted ? round.submissions[playerId] : null,
      };
      return accumulator;
    }, {});

    return {
      number: round.number,
      activeTeamId: round.activeTeamId,
      prompt,
      submissions,
      status: round.status,
      timeRemainingMs: this.getRoundTimeRemaining(lobby),
    };
  }

  buildPromptView(prompt, isActiveTeamMember) {
    if (prompt.type === PROMPT_TYPE.HIDDEN_WORD) {
      return {
        type: prompt.type,
        value: isActiveTeamMember ? prompt.value : null,
      };
    }

    if (prompt.type === PROMPT_TYPE.WORD_PAIR) {
      return {
        type: prompt.type,
        value: [...prompt.value],
      };
    }

    return prompt;
  }

  getStats() {
    let waiting = 0;
    let inProgress = 0;
    let ended = 0;

    this.lobbies.forEach((lobby) => {
      if (lobby.status === GAME_STATUS.WAITING) {
        waiting += 1;
      } else if (lobby.status === GAME_STATUS.IN_PROGRESS) {
        inProgress += 1;
      } else if (lobby.status === GAME_STATUS.ENDED) {
        ended += 1;
      }
    });

    return {
      lobbyCount: this.lobbies.size,
      waiting,
      inProgress,
      ended,
    };
  }

  listLobbiesForAdmin() {
    return Array.from(this.lobbies.values()).map((lobby) =>
      this.buildAdminView(lobby, { includeHistory: false })
    );
  }

  serializeLobbyForAdmin(lobbyCode, options = {}) {
    const lobby = this.lobbies.get(lobbyCode);
    if (!lobby) {
      return null;
    }

    return this.buildAdminView(lobby, options);
  }

  buildAdminView(lobby, { includeHistory = true } = {}) {
    const teams = lobby.teams.map((team) => ({
      id: team.id,
      name: team.name,
      score: team.score,
      players: team.players
        .map((playerId) => lobby.players.get(playerId))
        .filter(Boolean)
        .map((player) => ({
          id: player.id,
          name: player.name,
          isHost: player.isHost,
        })),
    }));

    const currentRound = lobby.currentRound
      ? {
          number: lobby.currentRound.number,
          activeTeamId: lobby.currentRound.activeTeamId,
          prompt: clonePrompt(lobby.currentRound.prompt),
          submissions: { ...lobby.currentRound.submissions },
          startedAt: lobby.currentRound.startedAt,
          status: lobby.currentRound.status,
          failureReason: lobby.currentRound.failureReason || null,
          timeRemainingMs: this.getRoundTimeRemaining(lobby),
        }
      : null;

    return {
      code: lobby.code,
      status: lobby.status,
      hostId: lobby.hostId,
      createdAt: lobby.createdAt,
      updatedAt: lobby.updatedAt,
      config: {
        pointsToWin: this.config.pointsToWin,
        maxRounds: this.config.maxRounds,
        submissionTimeoutMs: this.config.submissionTimeoutMs,
        teamSize: this.config.teamSize,
        maxTeams: this.config.maxTeams,
      },
      teams,
      players: Array.from(lobby.players.values()).map((player) => ({
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        isHost: player.isHost,
        joinedAt: player.joinedAt,
      })),
      currentRound,
      roundHistory: includeHistory ? lobby.roundHistory : undefined,
      gameSummary: lobby.gameSummary,
    };
  }

  getRoundTimeRemaining(lobby) {
    if (!lobby.currentRound) {
      return null;
    }

    const started = Date.parse(lobby.currentRound.startedAt);
    if (Number.isNaN(started)) {
      return null;
    }

    const elapsed = Date.now() - started;
    return Math.max(0, this.config.submissionTimeoutMs - elapsed);
  }

  getTeamPlayers(lobbyCode, teamId) {
    const lobby = this.lobbies.get(lobbyCode);
    if (!lobby) {
      return [];
    }

    const team = lobby.teams.find((candidate) => candidate.id === teamId);
    if (!team) {
      return [];
    }

    return team.players
      .map((playerId) => lobby.players.get(playerId))
      .filter(Boolean);
  }
}

module.exports = LobbyManager;
