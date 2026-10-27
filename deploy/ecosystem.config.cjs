const runtime = process.env.ONEASTER_RUNTIME === 'node' ? '/usr/bin/node' : '/usr/local/bin/bun';

module.exports = {
  apps: [
    {
      name: 'new-cms',
      cwd: '/opt/new-cms/current/runtime',
      script: 'server.js',
      interpreter: runtime,
      node_args:
        runtime === '/usr/bin/node'
          ? ['--env-file=/etc/new-cms/client.env', '--max-old-space-size=512']
          : [],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      min_uptime: 10000,
      max_restarts: 5,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 45000,
      max_memory_restart: '768M',
      out_file: '/var/lib/new-cms/logs/out.log',
      error_file: '/var/lib/new-cms/logs/error.log',
      log_date_format: 'YYYY-MM-DDTHH:mm:ssZ',
      env: {
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1',
        PORT: '__PORT__',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
};
