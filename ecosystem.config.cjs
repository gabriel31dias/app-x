// Produção (VPS): pm2 start ecosystem.config.cjs && pm2 save
// A API lê api/.env (PORT=3200). O nginx publica jogos./api./realtime.oramagames.site.
module.exports = {
  apps: [
    {
      name: 'orama-api',
      cwd: __dirname + '/api',
      script: 'dist/main.js',
      // ponytail: sessões ao vivo ficam em memória; mais de uma instância precisa do adapter Redis
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '600M',
      env: { NODE_ENV: 'production' },
      time: true,
    },
  ],
};
