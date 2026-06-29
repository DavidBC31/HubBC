// Configuration pm2 — démarre l'app justif (justificatifs + absences) en service permanent.
// Usage : pm2 start deploy/ecosystem.config.js  (puis `pm2 save` + `pm2 startup`)
// Adapter `cwd` au chemin réel sur la machine (ex. /Users/serveurit/Projets/justif).
module.exports = {
  apps: [
    {
      name: "justif-app",
      script: "npm",
      args: "run start", // next start
      cwd: "/Users/<user>/Projets/justif",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
      },
      autorestart: true,
      max_restarts: 10,
      time: true, // horodate les logs
    },
  ],
};
