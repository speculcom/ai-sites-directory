// Fictional teaching input: intentionally wrong, not production code.
export const redactSecrets = (line) => line.replace(/sk-[a-z0-9]{8}/, '[REDACTED]');
