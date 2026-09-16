export default {
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    // A single fork keeps one in-memory MongoDB instance across the suite
    // instead of paying its startup cost per file.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
};
