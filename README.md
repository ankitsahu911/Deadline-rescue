Deadline Rescue 🚨
AI-Powered Deadline Failure Prediction and Rescue Companion
Live Demo: deadline-rescue-mjyj-sandy.vercel.app  
Backend API: deadline-rescue.onrender.com
> ⚠️ First load may take 30–50 seconds due to Render's free-tier cold start.
---
What is Deadline Rescue?
Most productivity apps just remind you about deadlines. Deadline Rescue goes further — it predicts deadline failure before it happens and gives you an actionable rescue plan to recover.
When you enter a task, it:
Analyzes effort and cognitive load using AI
Calculates a deadline risk score
Breaks the task into actionable steps
Activates Rescue Mode if the risk is high
Learns from your past task patterns
Schedules work blocks to Google Calendar
Sends smart reminder emails
---
Features
Feature	Description
🧠 AI Task Analysis	Estimates effort, cognitive load, priority score, and execution steps
📊 Risk Prediction	Calculates deadline risk and explains why the task is at risk
🚨 Rescue Mode	Emergency plan with urgent actions when risk is high
🗓️ Google Calendar	Add AI-generated schedules directly to your calendar
📧 Email Reminders	Rich HTML emails with risk score, roadmap, and schedule
🧬 Personalized Memory	Learns from past tasks using RAG (vector memory)
🐳 Docker Support	Fully containerized with Docker Compose
---
Tech Stack
Frontend
Next.js + TypeScript
React
Tailwind CSS
Deployed on Vercel
Backend
FastAPI (Python)
LangGraph (multi-agent workflow)
Groq LLM API
ChromaDB (vector memory for RAG)
Google Calendar API
Gmail SMTP for email reminders
Deployed on Render
---
Architecture
```
User Input
    ↓
Task Analyzer Agent   → effort, cognitive load, steps, priority
    ↓
Memory Retrieval Agent → past similar tasks via ChromaDB
    ↓
Risk Engine Agent      → deadline risk score + reason
    ↓
Scheduler Agent        → normal schedule or emergency rescue plan
    ↓
Actions: Email • Google Calendar • Rescue Mode
```
---
Getting Started Locally
Prerequisites
Node.js 18+
Python 3.10+
Docker (optional)
Groq API key
Google Calendar OAuth credentials
Gmail App Password
1. Clone the repo
```bash
git clone https://github.com/ankitsahu911/Deadline-rescue.git
cd Deadline-rescue
```
2. Backend setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate       # Windows
# or
source .venv/bin/activate    # Mac/Linux

pip install -r requirements.txt
```
Create a `.env` file inside the `backend` folder:
```
GROQ_API_KEY=your_groq_api_key
EMAIL_FROM=your_gmail@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
```
Start the backend:
```bash
uvicorn main:app --reload
```
3. Frontend setup
```bash
cd ../frontend-app
npm install
```
Create a `.env.local` file inside the `frontend-app` folder:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
Start the frontend:
```bash
npm run dev
```
Open http://localhost:3000
4. Or use Docker Compose
```bash
# From the root folder
docker compose up -d --build
```
---
Environment Variables
Backend (`backend/.env`)
Variable	Description
`GROQ_API_KEY`	API key from groq.com
`EMAIL_FROM`	Gmail address for sending reminders
`EMAIL_PASSWORD`	Gmail App Password (not your regular password)
Frontend (`frontend-app/.env.local`)
Variable	Description
`NEXT_PUBLIC_API_URL`	Backend URL (`http://localhost:8000` for local, Render URL for production)
---
API Endpoints
Method	Endpoint	Description
GET	`/`	Health check
POST	`/analyze`	Analyze task and generate plan
GET	`/calendar/{date}`	Get free calendar slots
POST	`/schedule-event`	Add event to Google Calendar
POST	`/send-task-email`	Send reminder email
POST	`/reflect`	Store completed task to memory
GET	`/memories/{task_name}`	Retrieve similar past tasks
---
Future Plans
Firebase Auth for real user accounts
Firestore for cloud task storage
Voice assistant for hands-free task input
Push notifications
Google Calendar conflict detection
Habit tracking and completion analytics
Automatic rescheduling when planned blocks are missed
---
Built By
Ankit — GitHub
---
License
MIT License — feel free to use, fork, and build on this project.
