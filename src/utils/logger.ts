import { blue, yellow, red, green, gray, cyan, isColorSupported } from 'colorette';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

function getTimestamp(): string {
  const d = new Date();
  return d.toISOString().split('T')[1].split('.')[0];
}

export function logger(message: string, level: LogLevel = LogLevel.INFO, prefix?: string) {
  const ts = gray(`[${getTimestamp()}]`);
  const pfx = prefix ? blue(`[${prefix}]`) : '';

  let levelLabel: string;
  switch (level) {
    case LogLevel.INFO:
      levelLabel = green(`[INFO]`);
      break;
    case LogLevel.WARN:
      levelLabel = yellow(`[WARN]`);
      break;
    case LogLevel.ERROR:
      levelLabel = red(`[ERROR]`);
      break;
    case LogLevel.DEBUG:
      levelLabel = cyan(`[DEBUG]`);
      break;
    default:
      levelLabel = gray(`[LOG]`);
  }

  let line = `${ts} ${levelLabel} ${pfx}${message}`;
  if (isColorSupported) {
    switch (level) {
      case LogLevel.WARN:
        line = yellow(line);
        break;
      case LogLevel.ERROR:
        line = red(line);
        break;
      case LogLevel.DEBUG:
        line = cyan(line);
        break;
      default:
        break;
    }
  }

  if (!isColorSupported) {
    console.log(line.replace(/\x1B\[[0-9;]*[mK]/g, '').trim());
    return;
  }

  console.log(line);
}

logger.info = (msg: string, prefix?: string) => logger(msg, LogLevel.INFO, prefix);
logger.warn = (msg: string, prefix?: string) => logger(msg, LogLevel.WARN, prefix);
logger.error = (msg: string, prefix?: string) => logger(msg, LogLevel.ERROR, prefix);
logger.debug = (msg: string, prefix?: string) => logger(msg, LogLevel.DEBUG, prefix);
