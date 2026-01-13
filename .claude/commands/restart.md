# Restart Servers

Restart both the backend and frontend development servers.

## Steps

1. Kill any existing node processes running on ports 5001 (backend) and 3000 (frontend)
2. Start the backend server from `avelio-backend` directory using `npm start`
3. Start the frontend server from `avelio-frontend` directory using `npm start`
4. Run both servers in background and confirm they are running

## Commands

```bash
# Kill existing processes
cmd /c "taskkill /F /FI \"IMAGENAME eq node.exe\" 2>nul || echo No node processes to kill"

# Start backend
cd "D:\avelio-credit\avelio-backend" && npm start
# Run in background

# Start frontend
cd "D:\avelio-credit\avelio-frontend" && npm start
# Run in background
```

After starting, check that both servers are responding on their respective ports.
