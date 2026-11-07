import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const {Pool}=pg;
const __dirname=path.dirname(fileURLToPath(import.meta.url));

// Fail with an instruction, not a stack trace. The most common mistake is
// running this without DATABASE_URL, or pointing at a host that is not up.
if(!process.env.DATABASE_URL){
  console.error([
    'DATABASE_URL is not set, so there is nothing to migrate.',
    '',
    'Copy the connection string from your Neon project dashboard',
    '  (Neon → your project → Dashboard → Connection string)',
    'then run:',
    '  DATABASE_URL="postgresql://..." npm run db:migrate',
    '',
    'This applies the bundled schema and migrations; /api/ready checks required table names.'
  ].join('\n'));
  process.exit(1);
}
const useSsl=process.env.PGSSL==='true';
const rejectUnauthorized=process.env.PGSSL_REJECT_UNAUTHORIZED ? process.env.PGSSL_REJECT_UNAUTHORIZED==='true' : process.env.NODE_ENV==='production';
if(process.env.NODE_ENV==='production' && useSsl && !rejectUnauthorized) throw new Error('PGSSL_REJECT_UNAUTHORIZED must be true in production');
const ssl=useSsl?{rejectUnauthorized,...(process.env.PGSSL_CA?{ca:process.env.PGSSL_CA}:{})}:false;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl});
let client;
try{
  client=await pool.connect();
}catch(e){
  const host=(()=>{try{return new URL(process.env.DATABASE_URL).host}catch{return 'the configured host'}})();
  console.error(`Could not connect to the database at ${host}.`);
  console.error(e?.code==='ECONNREFUSED'
    ? 'Nothing is listening there. Check the port, and that the database is running and reachable from this machine.'
    : e?.code==='ENOTFOUND'
      ? 'That hostname does not resolve. Copy the connection string again from your Neon dashboard.'
      : (e?.message||String(e)));
  console.error('\nNothing was changed.');
  await pool.end().catch(()=>{});
  process.exit(1);
}
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
}catch(e){await client.query('ROLLBACK');
  if(e?.code==='ECONNREFUSED'||e?.code==='ENOTFOUND'){
    console.error(`Could not reach the database at ${new URL(process.env.DATABASE_URL).host}. Check the host in DATABASE_URL and that your network allows outbound PostgreSQL.`);
    process.exitCode=1;
  } else { console.error('Migration failed and was rolled back:', e?.message||e); process.exitCode=1; }
}finally{client.release();await pool.end()}
