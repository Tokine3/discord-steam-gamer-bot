module.exports = {
  apps: [
    {
      name: 'discord-bot',
      script: 'pnpm',
      args: 'start',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
