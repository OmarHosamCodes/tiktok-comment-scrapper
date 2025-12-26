type LogLevel = "info" | "warn" | "error" | "debug";

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

function getTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

function formatLevel(level: LogLevel): string {
  const levelColors: Record<LogLevel, string> = {
    info: colors.green,
    warn: colors.yellow,
    error: colors.red,
    debug: colors.blue,
  };
  return `${levelColors[level]}${level.toUpperCase().padEnd(5)}${colors.reset}`;
}

export const logger = {
  info: (message: string): void => {
    console.log(
      `${colors.dim}${getTimestamp()}${colors.reset} | ${formatLevel("info")} | ${message}`
    );
  },

  warn: (message: string): void => {
    console.log(
      `${colors.dim}${getTimestamp()}${colors.reset} | ${formatLevel("warn")} | ${message}`
    );
  },

  error: (message: string): void => {
    console.log(
      `${colors.dim}${getTimestamp()}${colors.reset} | ${formatLevel("error")} | ${message}`
    );
  },

  debug: (message: string): void => {
    console.log(
      `${colors.dim}${getTimestamp()}${colors.reset} | ${formatLevel("debug")} | ${message}`
    );
  },
};
