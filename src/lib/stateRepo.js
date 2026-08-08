import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOCAL_DATA = path.join(ROOT, 'data', 'state.json');
const DATABASE_URL = process.env.DATABASE_URL || '';
const IS_DB = Boolean(DATABASE_URL);
let sql = null;
let initialized = false;

function normalizePosition(position) {
  const p = String(position || '').toUpperCase();
  if (p === 'ED') return 'EDGE';
  return position;
}

function normalizeState(state) {
  if (Array.isArray(state?.players)) {
    for (const player of state.players) player.position = normalizePosition(player.position);
  }
  return state;
}

function client() {
  if (!IS_DB) return null;
  if (!sql) {
    sql = postgres(DATABASE_URL, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 20,
      ssl: 'require'
    });
  }
  return sql;
}

async function ensureDb() {
  if (!IS_DB || initialized) return;
  const db = client();
  await db`
    create table if not exists app_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await db`
    create table if not exists sync_locks (
      name text primary key,
      owner text not null,
      expires_at timestamptz not null,
      updated_at timestamptz not null default now()
    )
  `;
  initialized = true;
}

async function seedState() {
  return normalizeState(JSON.parse(await fs.readFile(LOCAL_DATA, 'utf8')));
}

export function storageMode() {
  return IS_DB ? 'postgres' : 'local-json';
}

export async function readState() {
  if (!IS_DB) return seedState();
  await ensureDb();
  const db = client();
  const rows = await db`select data from app_state where id = 'main' limit 1`;
  if (rows.length) return normalizeState(rows[0].data);
  const seed = await seedState();
  await db`insert into app_state (id, data) values ('main', ${db.json(seed)}) on conflict (id) do nothing`;
  const created = await db`select data from app_state where id = 'main' limit 1`;
  return normalizeState(created[0]?.data || seed);
}

export async function writeState(state) {
  normalizeState(state);
  if (!IS_DB) {
    const tmp = LOCAL_DATA + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(state, null, 2));
    await fs.rename(tmp, LOCAL_DATA);
    return;
  }
  await ensureDb();
  const db = client();
  await db`
    insert into app_state (id, data, updated_at)
    values ('main', ${db.json(state)}, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
  `;
}

export async function acquireSyncLock(name = 'full-sync', ttlMinutes = 20) {
  if (!IS_DB) return { acquired: true, owner: 'local' };
  await ensureDb();
  const db = client();
  const owner = crypto.randomUUID();
  const rows = await db`
    insert into sync_locks (name, owner, expires_at, updated_at)
    values (${name}, ${owner}, now() + (${ttlMinutes} || ' minutes')::interval, now())
    on conflict (name) do update
      set owner = excluded.owner,
          expires_at = excluded.expires_at,
          updated_at = now()
      where sync_locks.expires_at < now()
    returning owner
  `;
  return { acquired: rows.length > 0 && rows[0].owner === owner, owner };
}

export async function releaseSyncLock(name = 'full-sync', owner = '') {
  if (!IS_DB || !owner) return;
  await ensureDb();
  const db = client();
  await db`delete from sync_locks where name = ${name} and owner = ${owner}`;
}
