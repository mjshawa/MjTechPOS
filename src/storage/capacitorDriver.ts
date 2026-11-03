import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { SqlExecutor } from './types';

/** Android (and iOS): native SQLite through @capacitor-community/sqlite. */
export async function createCapacitorExecutor(): Promise<SqlExecutor> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const exists = (await sqlite.isConnection('barpos', false)).result;
  const db = exists
    ? await sqlite.retrieveConnection('barpos', false)
    : await sqlite.createConnection('barpos', false, 'no-encryption', 1, false);
  await db.open();

  return {
    exec: async sql => { await db.execute(sql); },
    run: async (sql, params = []) => { await db.run(sql, params); },
    all: async (sql, params = []) => (await db.query(sql, params)).values ?? [],
    batch: async stmts => {
      await db.executeSet(stmts.map(s => ({ statement: s.sql, values: s.params })), true);
    },
  };
}
