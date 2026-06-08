const childProcess = require("child_process");

const DEFAULT_CONNECTION = Object.freeze({
  execMode: "tcp",
  dockerContainer: "cfdi-postgres",
  host: "127.0.0.1",
  port: "5432",
  database: "cfdi_bot",
  user: "cfdi_bot_user",
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function normalizeExecMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "docker") return "docker";
  return "tcp";
}

function connectionFromEnv(env = process.env, overrides = {}) {
  const execMode = normalizeExecMode(overrides.execMode || overrides.dbExecMode || env.CFDI_DB_EXEC_MODE || DEFAULT_CONNECTION.execMode);
  return {
    execMode,
    dbExecMode: execMode,
    dockerContainer: text(overrides.dockerContainer || overrides.pgDockerContainer || env.CFDI_PG_DOCKER_CONTAINER) || DEFAULT_CONNECTION.dockerContainer,
    psqlBin: overrides.psqlBin || env.CFDI_PSQL_BIN || env.PSQL_BIN || "psql",
    dockerBin: overrides.dockerBin || env.CFDI_DOCKER_BIN || "docker",
    host: overrides.host || env.CFDI_PGHOST || env.POSTGRES_HOST || env.PGHOST || DEFAULT_CONNECTION.host,
    port: overrides.port || env.CFDI_PGPORT || env.POSTGRES_PORT || env.PGPORT || DEFAULT_CONNECTION.port,
    database: overrides.database || env.CFDI_PGDATABASE || env.POSTGRES_DB || env.PGDATABASE || DEFAULT_CONNECTION.database,
    user: overrides.user || env.CFDI_PGUSER || env.POSTGRES_USER || env.PGUSER || DEFAULT_CONNECTION.user,
    password: overrides.password || env.CFDI_PGPASSWORD || env.POSTGRES_PASSWORD || env.PGPASSWORD || "",
  };
}

function buildPsqlExecution(sql, config = {}) {
  const resolved = {
    ...connectionFromEnv({}, config),
    ...config,
  };
  const execMode = normalizeExecMode(resolved.execMode || resolved.dbExecMode);
  if (execMode === "docker") {
    const env = { ...process.env };
    delete env.PGPASSWORD;
    delete env.CFDI_PGPASSWORD;
    delete env.POSTGRES_PASSWORD;
    return {
      command: resolved.dockerBin || "docker",
      args: [
        "exec",
        "-i",
        String(resolved.dockerContainer || DEFAULT_CONNECTION.dockerContainer),
        "psql",
        "-U", String(resolved.user || DEFAULT_CONNECTION.user),
        "-d", String(resolved.database || DEFAULT_CONNECTION.database),
        "-At",
        "-F", "",
        "-c", sql,
      ],
      env,
      execMode,
    };
  }

  const env = { ...process.env, PGCONNECT_TIMEOUT: "8" };
  if (resolved.password) env.PGPASSWORD = resolved.password;
  return {
    command: resolved.psqlBin || "psql",
    args: [
      "-w",
      "-h", String(resolved.host || DEFAULT_CONNECTION.host),
      "-p", String(resolved.port || DEFAULT_CONNECTION.port),
      "-d", String(resolved.database || DEFAULT_CONNECTION.database),
      "-U", String(resolved.user || DEFAULT_CONNECTION.user),
      "-At",
      "-F", "",
      "-c", sql,
    ],
    env,
    execMode,
  };
}

function runPsqlRaw(sql, options = {}) {
  const config = {
    ...connectionFromEnv(options.env || process.env, options.dbConfig || {}),
    ...(options.dbConfig || {}),
  };
  if (options.dbExecMode) config.execMode = options.dbExecMode;
  if (options.execMode) config.execMode = options.execMode;
  if (options.pgDockerContainer) config.dockerContainer = options.pgDockerContainer;
  const execution = buildPsqlExecution(sql, config);
  const execFileSync = options.execFileSync || childProcess.execFileSync;
  try {
    return execFileSync(execution.command, execution.args, {
      env: execution.env,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const wrapped = new Error(`LOCAL_DB_PSQL_FAILED:${execution.execMode}`);
    wrapped.code = "LOCAL_DB_PSQL_FAILED";
    wrapped.execMode = execution.execMode;
    wrapped.stderr = error && error.stderr ? String(error.stderr).slice(0, 500) : "";
    throw wrapped;
  }
}

function parsePsqlFirstJsonLine(raw) {
  const line = String(raw || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  return line ? JSON.parse(line) : null;
}

function runPsqlJson(sql, options = {}) {
  return parsePsqlFirstJsonLine(runPsqlRaw(sql, options));
}

module.exports = {
  DEFAULT_CONNECTION,
  buildPsqlExecution,
  connectionFromEnv,
  normalizeExecMode,
  parsePsqlFirstJsonLine,
  runPsqlJson,
  runPsqlRaw,
};
