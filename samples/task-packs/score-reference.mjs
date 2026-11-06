// Designed reference: unjudged rows leave both the numerator and the denominator.
export const accuracy = (rows) => {
  const graded = rows.filter((row) => typeof row.passed === 'boolean');
  return graded.length ? graded.filter((row) => row.passed).length / graded.length : null;
};
