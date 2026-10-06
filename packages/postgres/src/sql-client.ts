export type Queryable = {
  query<Row>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
};

export type SqlClient = Queryable & {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
};

type PoolClientLike = Queryable & { release(): void };
type PoolLike = Queryable & { connect(): Promise<PoolClientLike> };

export function fromPgPool(pool: PoolLike): SqlClient {
  return {
    query: (sql, params) => pool.query(sql, params),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await work(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
