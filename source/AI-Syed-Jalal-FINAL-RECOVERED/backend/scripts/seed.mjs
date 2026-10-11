import crypto from 'node:crypto'; import pg from 'pg'; const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:false}:false});
const username=process.env.SEED_ADMIN_USERNAME||'admin'; const password=process.env.SEED_ADMIN_PASSWORD||'';
if(password.length<12||/change-?me|replace/i.test(password)){console.error('SEED_ADMIN_PASSWORD must be set to a strong value (12+ chars, not a placeholder).');process.exit(1)}
const id=crypto.randomUUID(); const salt=crypto.randomBytes(16).toString('hex'); const hash=crypto.scryptSync(password,salt,64).toString('hex');
await pool.query(`INSERT INTO app_users(id,username,role,salt,password_hash) VALUES($1,$2,'Admin',$3,$4) ON CONFLICT(username) DO NOTHING`,[id,username,salt,hash]);
console.log(`Seed checked for user ${username}. Change the initial password before production use.`); await pool.end();
