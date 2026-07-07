module.exports = {
  apps: [
    {
      name: 'arjun-glass-house',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: '/var/www/arjun_glass_house',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '700M',
      time: true,
      autorestart: true,
    },
  ],
};

