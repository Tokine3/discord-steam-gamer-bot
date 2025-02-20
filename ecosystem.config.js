module.exports = {
  apps: [
    {
      name: 'discord-bot',
      script: 'pnpm',
      args: 'start:bot',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: 'next-api',
      script: 'pnpm',
      args: 'start:api',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
