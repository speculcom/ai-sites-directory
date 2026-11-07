// Fictional teaching input: intentionally wrong, not production code.
export const accuracy = (rows) => rows.filter((row) => row.passed !== false).length / rows.length;
