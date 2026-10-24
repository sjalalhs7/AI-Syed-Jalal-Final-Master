import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const {Pool}=pg;
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const useSsl=process.env.PGSSL==='true';
const rejectUnauthorized=process.env.PGSSL_REJECT_UNAUTHORIZED ? process.env.PGSSL_REJECT_UNAUTHORIZED==='true' : process.env.NODE_ENV==='production';
if(process.env.NODE_ENV==='production' && useSsl && !rejectUnauthorized) throw new Error('PGSSL_REJECT_UNAUTHORIZED must be true in production');
const ssl=useSsl?{rejectUnauthorized,...(process.env.PGSSL_CA?{ca:process.env.PGSSL_CA}:{})}:false;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl});
const client=await pool.connect();
try{
  await client.query('BEGIN');
  const schema=await fs.readFile(path.join(__dirname,'../db/schema.sql'),'utf8');
  await client.query(schema);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files=(await fs.readdir(path.join(__dirname,'../db/migrations'))).filter(f=>f.endsWith('.sql')).sort();
  const done=new Set((await client.query('SELECT version FROM schema_migrations')).rows.map(r=>r.version));
  for(const file of files){if(done.has(file)) continue; const sql=await fs.readFile(path.join(__dirname,'../db/migrations',file),'utf8'); await client.query(sql); await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]); console.log(`Applied ${file}`)}
  await client.query('COMMIT');
  console.log('V43 database schema and migrations ready.');
}catch(e){await client.query('ROLLBACK');throw e}finally{client.release();await pool.end()}
