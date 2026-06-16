// Configuration pm2 — démarre l'app Pointages en service permanent.
// Usage : pm2 start deploy/ecosystem.config.js  (puis `pm2 save` + `pm2 startup`)
// Adapter `cwd` au chemin réel de l'app sur la machine.
module.exports = {
  apps: [
    {
      name: "pointages",
      script: "npm",
      args: "run start", // next start, écoute sur le port 3000
      cwd: "/Users/<user>/apps/Pointages",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      autorestart: true,
      max_restarts: 10,
      time: true, // horodate les logs
    },
  ],
};
