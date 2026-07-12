module.exports = {
  apps: [
    {
      name: "dtt-api",
      cwd: "./artifacts/api-server",
      script: "node",
      args: "--enable-source-maps --env-file=../../.env ./dist/index.mjs",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "dtt-frontend",
      cwd: "./artifacts/pipeline",
      script: "node",
      args: "--experimental-vm-modules start.mjs",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
