// Local/test counterpart to the Neon HTTP adapter. Production still uses Neon.
// Only the query and non-interactive, READ COMMITTED transaction interfaces
// used by this application are implemented here.
export function createPgliteAdapter(database) {
  const getDatabase = typeof database === 'function' ? database : () => database;
  return {
    async query(sql, params = []) {
      return (await getDatabase().query(sql, params)).rows;
    },
    async transaction(buildQueries, options = {}) {
      if (options.isolationLevel && options.isolationLevel !== 'ReadCommitted') {
        throw new Error('The local adapter only supports READ COMMITTED batches.');
      }
      if (typeof buildQueries !== 'function') throw new TypeError('Expected a transaction query builder.');
      // Construct descriptors synchronously, like Neon's non-interactive batch;
      // do not execute any query until the PGlite transaction has started.
      const queries = buildQueries({ query: (text, params = []) => ({ text, params }) });
      if (!Array.isArray(queries) || queries.some(q => typeof q?.text !== 'string' || !Array.isArray(q.params))) {
        throw new TypeError('Expected a list of transaction queries.');
      }
      return getDatabase().transaction(async tx => {
        const results = [];
        for (const query of queries) results.push((await tx.query(query.text, query.params)).rows);
        return results;
      });
    }
  };
}
