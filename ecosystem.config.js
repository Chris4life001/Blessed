module.exports = {
  apps: [
    {
      name: "xpresspro-fx",
      script: "artifacts/api-server/dist/index.mjs",
      // IMPORTANT: This API stores sessions and platform state in process memory.
      // Cluster mode would create isolated worker memory — auth/sessions become
      // non-deterministic across workers. Stay in fork mode (single process) until
      // sessions are externalized to Redis or the database.
      instances: 1,
      exec_mode: "fork",
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
