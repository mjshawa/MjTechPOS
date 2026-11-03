/**
 * Sync for small records that CHANGE over time (open bar tabs, business details). Same idea as the product catalog:
 *  1. pull what other devices changed (server-side updated_at cursor),
 *  2. push what changed here. A record edited here and not yet pushed always wins over an incoming copy.
 * A removed record (a paid tab) is pushed as a tombstone row (deleted = true) so the other devices drop it too.
 * `state` holds the hashes/cursors between runs and is updated in place. Returns '' or a message to show the owner.
 */
export const TOMB = '__deleted__';
type Rec = { id: string; data: any };

export async function syncMutableRecords(
  supabase: any, storeId: string, state: any, table: string, name: string, local: Rec[], pristine: (d: any) => boolean,
  apply: (incoming: Rec[], removed: string[]) => void, tombstones: boolean,
): Promise<string> {
  const hashes: Record<string, string> = { ...(state[name + 'Hashes'] || {}) };
  let cursor: string = state[name + 'Cursor'] || '1970-01-01T00:00:00Z';
  const localMap = new Map(local.map(r => [r.id, r]));
  const isDirty = (r: Rec) => (hashes[r.id] === undefined ? !pristine(r.data) : hashes[r.id] !== JSON.stringify(r.data));

  // pull
  const incoming: Rec[] = []; const removed: string[] = [];
  for (;;) {
    const { data, error: err } = await supabase.from(table).select('id, data, deleted, updated_at')
      .eq('store_id', storeId).gt('updated_at', cursor).order('updated_at', { ascending: true }).limit(1000);
    if (err) {
      if (['42P01', 'PGRST205'].includes(err.code)) return `Table "${table}" is missing in Supabase. Run supabase/migrations/5_open_tabs_settings.sql.`;
      throw err;
    }
    if (!data || !data.length) break;
    for (const row of data) {
      const l = localMap.get(row.id);
      if (l && isDirty(l)) continue;                                               // edited here, not pushed yet: ours wins
      if (!l && hashes[row.id] !== undefined && hashes[row.id] !== TOMB) continue; // removed here, tombstone not pushed yet
      if (row.deleted) { removed.push(row.id); hashes[row.id] = TOMB; }
      else { incoming.push({ id: row.id, data: row.data }); hashes[row.id] = JSON.stringify(row.data); }
    }
    cursor = data[data.length - 1].updated_at;
    if (data.length < 1000) break;
  }
  if (incoming.length || removed.length) apply(incoming, removed);

  // push
  const after = new Map(localMap);
  removed.forEach(id => after.delete(id));
  incoming.forEach(r => after.set(r.id, r));
  const rows: any[] = [];
  after.forEach(r => {
    if (hashes[r.id] !== JSON.stringify(r.data) && !(hashes[r.id] === undefined && pristine(r.data))) rows.push({ store_id: storeId, id: r.id, data: r.data, deleted: false });
  });
  if (tombstones) Object.keys(hashes).forEach(id => { if (hashes[id] !== TOMB && !after.has(id)) rows.push({ store_id: storeId, id, data: {}, deleted: true }); });
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error: err } = await supabase.from(table).upsert(chunk, { onConflict: 'store_id,id' });
    if (err) throw err;
    chunk.forEach(r => { hashes[r.id] = r.deleted ? TOMB : JSON.stringify(r.data); });
  }
  state[name + 'Hashes'] = hashes;
  state[name + 'Cursor'] = cursor;
  return '';
}
