const fs = require("fs");

function formatPayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(payload);
  }
}

function writeAnnotation(level, message) {
  if (process.env.GITHUB_ACTIONS) {
    const escaped = message.replace(/\r?\n/g, "%0A");
    process.stdout.write(`::${level}::${escaped}\n`);
    return;
  }
  process.stdout.write(`[${level.toUpperCase()}] ${message}\n`);
}

function info(message, payload) {
  process.stdout.write(`${message}${payload === undefined ? "" : `\n${formatPayload(payload)}`}\n`);
}

function warn(message, payload) {
  const body = payload === undefined ? message : `${message}\n${formatPayload(payload)}`;
  writeAnnotation("warning", body);
}

function error(message, payload) {
  const body = payload === undefined ? message : `${message}\n${formatPayload(payload)}`;
  writeAnnotation("error", body);
}

function startGroup(title) {
  if (process.env.GITHUB_ACTIONS) {
    process.stdout.write(`::group::${title}\n`);
    return;
  }
  process.stdout.write(`\n=== ${title} ===\n`);
}

function endGroup() {
  if (process.env.GITHUB_ACTIONS) {
    process.stdout.write("::endgroup::\n");
  }
}

function appendSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }
  const value = Array.isArray(lines) ? lines.join("\n") : String(lines);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${value}\n`, "utf8");
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value)}\n`, "utf8");
}

function divider(title) {
  info(`--- ${title} ---`);
}

module.exports = {
  info,
  warn,
  error,
  startGroup,
  endGroup,
  appendSummary,
  setOutput,
  divider,
};
