# Deadline Rescue Docker Guide

## Start Docker Desktop

Open Docker Desktop first. If Docker says WSL is missing, run this once from an Administrator PowerShell:

```powershell
wsl --install
wsl --set-default-version 2
```

Restart Windows if WSL asks you to.

## Required backend files

Before running Docker, make sure these files exist:

```text
backend/.env
backend/credentials.json
backend/token.json
```

The `.env` file should contain:

```env
GROQ_API_KEY=your_groq_api_key
EMAIL_FROM=yourgmail@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
```

## Run the app

From the project root:

```powershell
cd C:\Users\anknk\OneDrive\Desktop\Deadline-rescue
docker compose up -d --build
```

Open:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:8000
```

## Useful commands

```powershell
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

The backend uses `requirements.docker.txt`, which avoids huge PyTorch/CUDA downloads. The local virtual environment can still use the original `requirements.txt`.
