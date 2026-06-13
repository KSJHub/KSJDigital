module.exports = {
  apps: [
    {
      name: 'ksjdigital-portal-api',
      script: 'server/portalApiServer.js',
      cwd: '/home/ksjdigital/site',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORTAL_API_PORT: 4174,
        GITHUB_REPO: 'KSJHub/KSJDigital',
        GITHUB_BRANCH: 'main',
      },
      env_file: '.env.portal',
      max_memory_restart: '256M',
      watch: false,
      autorestart: true,
    },
  ],
};
