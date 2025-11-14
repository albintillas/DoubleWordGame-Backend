const express = require("express");
const router = express.Router();

const logger = require("../utils/logger");
const {
  broadcastLobbyState,
  notifyRoundStart,
  emitRoundCompleted,
  emitGameEnded,
} = require("../socket/helpers");

const extractBasicAuthCredentials = (headerValue) => {
  if (typeof headerValue !== "string") {
    return null;
  }

  const prefix = "Basic ";
  if (!headerValue.startsWith(prefix)) {
    return null;
  }

  const encoded = headerValue.slice(prefix.length).trim();
  if (!encoded) {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return null;
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return {
      username,
      password,
    };
  } catch (error) {
    logger.warn("Failed to decode admin credentials", { error: error.message });
    return null;
  }
};

const sendUnauthorized = (res, message) => {
  res.set("WWW-Authenticate", 'Basic realm="Admin Area"');
  res.status(401).json({ message });
};

const requireAdminAuth = (req, res, next) => {
  const config = req.app.locals?.config;
  if (!config || !config.adminAuth) {
    res.status(503).json({ message: "Admin configuration unavailable." });
    return;
  }

  const credentials = extractBasicAuthCredentials(req.headers.authorization);

  if (!credentials) {
    sendUnauthorized(res, "Authentication required.");
    return;
  }

  const { username, password } = credentials;
  const { username: expectedUser, password: expectedPass } = config.adminAuth;

  if (username !== expectedUser || password !== expectedPass) {
    sendUnauthorized(res, "Invalid credentials.");
    return;
  }

  req.adminUser = { username };
  next();
};

const getLobbyManager = (req) => req.app.locals?.lobbyManager || null;
const getSocketServer = (req) => req.app.locals?.io || null;

router.use(requireAdminAuth);

router.get("/stats", (req, res) => {
  const lobbyManager = getLobbyManager(req);
  if (!lobbyManager) {
    res.status(503).json({ message: "Lobby manager unavailable." });
    return;
  }

  const stats = lobbyManager.getStats();
  res.json({
    stats,
    timestamp: new Date().toISOString(),
  });
});

router.get("/lobbies", (req, res) => {
  const lobbyManager = getLobbyManager(req);
  if (!lobbyManager) {
    res.status(503).json({ message: "Lobby manager unavailable." });
    return;
  }

  const lobbies = lobbyManager.listLobbiesForAdmin();
  res.json({
    count: lobbies.length,
    lobbies,
    timestamp: new Date().toISOString(),
  });
});

router.get("/lobbies/:lobbyCode", (req, res) => {
  const lobbyManager = getLobbyManager(req);
  if (!lobbyManager) {
    res.status(503).json({ message: "Lobby manager unavailable." });
    return;
  }

  const includeHistory = req.query.includeHistory !== "false";
  const lobby = lobbyManager.serializeLobbyForAdmin(req.params.lobbyCode, {
    includeHistory,
  });

  if (!lobby) {
    res.status(404).json({ message: "Lobby not found." });
    return;
  }

  res.json({ lobby, timestamp: new Date().toISOString() });
});

router.get("/config", (req, res) => {
  const config = req.app.locals?.config;
  if (!config) {
    res.status(503).json({ message: "Config unavailable." });
    return;
  }

  const lobbyManager = getLobbyManager(req);

  res.json({
    submissionTimeoutMs: config.submissionTimeoutMs,
    pointsToWin: config.pointsToWin,
    maxRounds: config.maxRounds,
    teamSize: lobbyManager ? lobbyManager.config.teamSize : undefined,
    maxTeams: lobbyManager ? lobbyManager.config.maxTeams : undefined,
    timestamp: new Date().toISOString(),
  });
});

router.post("/lobbies/:lobbyCode/rounds/current/force-failure", (req, res) => {
  const lobbyManager = getLobbyManager(req);
  if (!lobbyManager) {
    res.status(503).json({ message: "Lobby manager unavailable." });
    return;
  }

  const io = getSocketServer(req);
  const { reason } = req.body || {};
  const failureReason =
    typeof reason === "string" && reason.trim().length
      ? reason.trim()
      : "admin";

  const result = lobbyManager.forceRoundFailure(
    req.params.lobbyCode,
    failureReason
  );

  if (!result) {
    res
      .status(404)
      .json({ message: "No active round to fail for that lobby." });
    return;
  }

  if (io) {
    if (result.roundSummary) {
      emitRoundCompleted(io, result.lobby.code, result.roundSummary);
    }

    broadcastLobbyState(io, lobbyManager, result.lobby);

    if (result.gameEnded) {
      emitGameEnded(io, result.lobby.code, result.gameSummary);
    } else if (result.nextRound) {
      notifyRoundStart(io, lobbyManager, result.lobby, result.nextRound);
    }
  }

  res.json({
    message: "Round failure triggered.",
    roundSummary: result.roundSummary,
    gameEnded: Boolean(result.gameEnded),
    nextRoundNumber: result.nextRound ? result.nextRound.number : null,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
