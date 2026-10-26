import crypto from 'node:crypto';
import pg from 'pg';
const {Pool}=pg;
const useSsl=process.env.PGSSL==='true';
const rejectUnauthorized=process.env.PGSSL_REJECT_UNAUTHORIZED ? process.env.PGSSL_REJECT_UNAUTHORIZED==='true' : process.env.NODE_ENV==='production';
if(process.env.NODE_ENV==='production' && useSsl && !rejectUnauthorized) throw new Error('PGSSL_REJECT_UNAUTHORIZED must be true in production');
const ssl=useSsl?{rejectUnauthorized,...(process.env.PGSSL_CA?{ca:process.env.PGSSL_CA}:{})}:false;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl});
const username=process.env.SEED_ADMIN_USERNAME||'admin';
const password=process.env.SEED_ADMIN_PASSWORD||'';
if(password.length<12||/change-?me|replace/i.test(password)){console.error('SEED_ADMIN_PASSWORD must be set to a strong value (12+ chars, not a placeholder).');process.exit(1)}
const id=crypto.randomUUID();
const salt=crypto.randomBytes(16).toString('hex');
const hash=crypto.scryptSync(password,salt,64).toString('hex');
try {
  await pool.query(`INSERT INTO app_users(id,username,role,salt,password_hash) VALUES($1,$2,'Admin',$3,$4) ON CONFLICT(username) DO NOTHING`,[id,username,salt,hash]);
  console.log(`Seed checked for user ${username}. If the account already exists, its password was not changed.`);
} finally { await pool.end(); }
