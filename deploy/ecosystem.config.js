// Configuration pm2 — démarre l'app HubBC (justificatifs) en service permanent.
// Usage : pm2 start deploy/ecosystem.config.js  (puis `pm2 save` + `pm2 startup`)
// Adapter `cwd` au chemin réel sur la machine.
//
// Le process s'appelle « pointages-app » et écoute sur le port 3002 : c'est ce
// que le tunnel route pour justif.bleucitron.app. NE PAS le nommer « pointages »
// (déjà pris par le projet relances voisin ~/Projets/pointages, port 3001).
module.exports = {
  apps: [
    {
      name: "pointages-app",
      script: "npm",
      args: "run start", // next start
      cwd: "/Users/<user>/Projets/HubBC",
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
