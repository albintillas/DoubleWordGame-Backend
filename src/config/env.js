const dotenv = require("dotenv");

dotenv.config();

const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseAllowedOrigins = (value) => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const port = parseNumber(process.env.PORT, 3000);
const pointsToWin = parseNumber(process.env.POINTS_TO_WIN, 5);
const maxRounds = parseNumber(process.env.MAX_ROUNDS, 20);
const submissionTimeoutMs = parseNumber(
  process.env.SUBMISSION_TIMEOUT_MS,
  10000
);

const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "change-me";

module.exports = {
  port,
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: (process.env.NODE_ENV || "development") === "production",
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  pointsToWin,
  maxRounds,
  submissionTimeoutMs,
  adminAuth: {
    username: adminUsername,
    password: adminPassword,
  },
};
