const { GAME_STATUS, DEFAULT_TEAM_NAMES } = require("./constants");

const createPlayer = ({ id, name, isHost = false }) => ({
  id,
  name: name.trim(),
  teamId: null,
  isHost,
  joinedAt: new Date().toISOString(),
});

const createTeam = ({ id, name }) => ({
  id,
  name,
  players: [],
  score: 0,
});

const createDefaultTeams = () =>
  DEFAULT_TEAM_NAMES.map((name, index) =>
    createTeam({
      id: `team-${index + 1}`,
      name,
    })
  );

const createLobby = ({ code, config, hostId }) => ({
  code,
  status: GAME_STATUS.WAITING,
  hostId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  teams: createDefaultTeams(),
  players: new Map(),
  turnOrder: [],
  turnCursor: 0,
  currentRound: null,
  roundHistory: [],
  nextPrompt: null,
  wordChain: [],
  gameSummary: null,
  config,
});

module.exports = {
  createPlayer,
  createTeam,
  createLobby,
};
