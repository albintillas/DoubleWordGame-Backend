const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const config = require("./config/env");
const logger = require("./utils/logger");
const healthRouter = require("./routes/health");
const adminRouter = require("./routes/admin");

const app = express();

const allowedOrigins = config.allowedOrigins;
const corsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin)
    ) {
      callback(null, true);
      return;
    }

    logger.warn("Blocked CORS request", { origin });
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/", healthRouter);
app.use("/admin", adminRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, _next) => {
  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
