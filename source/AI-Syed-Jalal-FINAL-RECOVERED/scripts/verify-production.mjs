const required=['DATABASE_URL','CORS_ORIGIN','SESSION_TTL_HOURS'];
const missing=required.filter(k=>!process.env[k]);
if(missing.length){console.error('Missing production environment variables:',missing.join(', '));process.exit(1)}
if(process.env.CORS_ORIGIN==='*'){console.error('CORS_ORIGIN must not be * in production');process.exit(1)}
if(Number(process.env.SESSION_TTL_HOURS)<1){console.error('SESSION_TTL_HOURS must be at least 1');process.exit(1)}
console.log('Production environment checks passed.');
