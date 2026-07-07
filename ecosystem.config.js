module.exports = {
  apps: [
    {
      name: "xpresspro-fx",
      script: "artifacts/api-server/dist/index.mjs",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      env_production: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 8080,
      },
    },
  ],
};
