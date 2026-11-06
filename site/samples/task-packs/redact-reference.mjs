// Designed reference for two fictional key formats in one line; not a log pipeline.
export const redactSecrets = (line) => line
  .replace(/sk-[a-z0-9]{8}/g, '[REDACTED]')
  .replace(/token=[a-z0-9]{8}/g, 'token=[REDACTED]');
