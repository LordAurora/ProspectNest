type Fields = Record<string, unknown>;

function write(level: 'info' | 'warn' | 'error', message: string, fields?: Fields) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === 'info') console.log(line);
  else console.error(line);
}

/** Structured JSON logs. Never pass secrets or full page bodies. */
export const logger = {
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
};
