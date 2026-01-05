module.exports = {
  apps: [
    {
      name: 'avelio-backend',
      cwd: './avelio-backend',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      }
    },
    {
      name: 'avelio-frontend',
      cwd: './avelio-frontend',
      script: 'node_modules/react-scripts/scripts/start.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        HOST: '0.0.0.0',
        BROWSER: 'none'
      }
    }
  ]
};
