from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from graph.workflow import graph
from rag.vectordb import store_task, retrieve_similar
from calendar_service import get_free_slots, create_event, mark_event_completed
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from typing import Any, Optional
import os
import smtplib
import uuid

load_dotenv()
app = FastAPI()

# Allow frontend to call backend (restrict origins for security)
app.add_middleware(
  CORSMiddleware,
  allow_origins=[
    "https://deadline-rescue-mjyj-sandy.vercel.app",
    "http://localhost:3000",  # keep this for local testing
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

class TaskInput(BaseModel):
    task_name: str
    deadline: str
    description: str = ""

class ReflectInput(BaseModel):
    task_name: str
    actual_hours: float
    on_time: bool
    cognitive_load: str = "deep_focus"
    best_time: str = "evening"
    notes: str = ""

class CompleteCalendarInput(BaseModel):
    event_id: str

class ScheduleEventInput(BaseModel):
    title: str = Field(min_length=1)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_hour: int = Field(default=18, ge=0, le=23)
    duration_hours: float = Field(default=1, gt=0, le=24)
    description: str = ""

class TaskEmailInput(BaseModel):
    email: str
    task_name: str
    deadline: str
    status: str = "active"
    risk_score: int
    risk_reason: str
    effort_hours: float
    priority_score: int = 0
    cognitive_load: str = ""
    steps: list[dict[str, Any]] = Field(default_factory=list)
    final_plan: dict[str, Any] = Field(default_factory=dict)
    rescue_mode: bool = False
    actual_hours: Optional[float] = None
    calendar_link: Optional[str] = None
    shock_scenarios: list[dict[str, Any]] = Field(default_factory=list)

def html_escape(value: Any) -> str:
    return escape(str(value), quote=True)

@app.get("/")
async def root():
    return {"status": "AI Deadline Rescue Agent is running"}

@app.post("/analyze")
async def analyze_task(task: TaskInput):
    initial_state = {
        "task_name": task.task_name,
        "deadline": task.deadline,
        "description": task.description,
        "effort_hours": 0,
        "cognitive_load": "",
        "priority_score": 0,
        "steps": [],
        "memories": [],
        "free_slots": {},
        "risk_score": 0,
        "risk_reason": "",
        "rescue_mode": False,
        "final_plan": {}
    }
    result = graph.invoke(initial_state)
    return {
        "task_name": task.task_name,
        "deadline": task.deadline,
        "effort_hours": result["effort_hours"],
        "cognitive_load": result["cognitive_load"],
        "priority_score": result["priority_score"],
        "steps": result["steps"],
        "memories": result["memories"],
        "risk_score": result["risk_score"],
        "risk_reason": result["risk_reason"],
        "rescue_mode": result["rescue_mode"],
        "final_plan": result["final_plan"]
    }

@app.get("/calendar/{date}")
async def get_calendar(date: str):
    return get_free_slots(date)

@app.post("/schedule-event")
async def schedule_event(data: ScheduleEventInput):
    try:
        return create_event(
            title=data.title,
            date_str=data.date,
            start_hour=data.start_hour,
            duration_hours=data.duration_hours,
            description=data.description
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calendar event could not be created: {e}")

@app.post("/calendar/complete-event")
async def complete_calendar_event(data: CompleteCalendarInput):
    return mark_event_completed(data.event_id)

@app.post("/send-task-email")
async def send_task_email(data: TaskEmailInput):
    email_from = os.getenv("EMAIL_FROM")
    email_password = os.getenv("EMAIL_PASSWORD")

    if not email_from or not email_password:
        raise HTTPException(
            status_code=500,
            detail="Email is not configured. Add EMAIL_FROM and EMAIL_PASSWORD to backend/.env"
        )

    is_completed = data.status == "completed"
    risk_score = max(0, min(100, int(data.risk_score)))
    risk_color = "#DC2626" if risk_score > 75 else "#D97706" if risk_score > 50 else "#16A34A"
    status_label = "Completed" if is_completed else "Not completed yet"
    headline = "Task completed" if is_completed else ("Rescue reminder" if data.rescue_mode else "Deadline reminder")
    schedule_key = "emergency_schedule" if data.rescue_mode else "schedule"
    schedule = data.final_plan.get(schedule_key, [])
    safe_task_name = html_escape(data.task_name)
    safe_deadline = html_escape(data.deadline)
    safe_status_label = html_escape(status_label)
    safe_risk_reason = html_escape(data.risk_reason)
    safe_headline = html_escape(headline)
    safe_message = html_escape(data.final_plan.get("message", ""))

    steps_html = "".join(
        f"<li><strong>{html_escape(step.get('step', 'Step'))}</strong> - {html_escape(step.get('duration_minutes', 0))} minutes</li>"
        for step in data.steps
    ) or "<li>No roadmap steps were generated.</li>"

    schedule_html = "".join(
        f"<li><strong>{html_escape(item.get('time', 'TBD'))}</strong> - {html_escape(item.get('activity', data.task_name))} ({html_escape(item.get('duration', 'planned work'))})</li>"
        for item in schedule
    ) or "<li>No schedule was generated.</li>"

    shock_html = "".join(
        f"<tr><td style='padding:8px 0;color:#5B564E'>{html_escape(item.get('label', 'Scenario'))}</td><td style='padding:8px 0;text-align:right;font-weight:700;color:{risk_color}'>{html_escape(item.get('risk_score', 0))}%</td></tr>"
        for item in data.shock_scenarios
    ) or "<tr><td style='padding:8px 0;color:#5B564E'>No future scenarios available</td><td></td></tr>"

    completion_note = ""
    if is_completed:
        completion_note = f"""
        <div style="background:#E9F6ED;border:1px solid #16A34A33;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
          <strong style="color:#16A34A;">Completed:</strong>
          <span style="color:#1C1B1A;">You marked this task as done{f" after {html_escape(data.actual_hours)} hours" if data.actual_hours else ""}.</span>
        </div>
        """
    else:
        completion_note = """
        <div style="background:#FCE9E8;border:1px solid #DC262633;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
          <strong style="color:#DC2626;">Still pending:</strong>
          <span style="color:#1C1B1A;">This task has not been completed yet. Start with the first roadmap step below.</span>
        </div>
        """

    calendar_button = ""
    if data.calendar_link:
        safe_calendar_link = html_escape(data.calendar_link)
        calendar_button = f"""
        <p style="margin:18px 0 0;">
          <a href="{safe_calendar_link}" style="display:inline-block;background:#FDF1E1;color:#D97706;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;">Open Google Calendar event</a>
        </p>
        """

    extension_email = html_escape(data.final_plan.get("extension_email", ""))
    extension_html = ""
    if extension_email:
        extension_html = f"""
        <div style="background:#FAF8F4;border:1px solid #E7E2D9;border-radius:12px;padding:16px;margin-top:16px;">
          <h3 style="font-size:14px;color:#5B564E;margin:0 0 10px;">Extension email draft</h3>
          <p style="white-space:pre-wrap;color:#1C1B1A;font-size:13px;line-height:1.6;margin:0;">{extension_email}</p>
        </div>
        """

    html = f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#FAF8F4;padding:28px;">
      <div style="max-width:680px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E2D9;border-radius:18px;overflow:hidden;">
        <div style="background:#4F46E5;color:#FFFFFF;padding:24px 28px;">
          <h1 style="margin:0;font-size:22px;">{safe_headline}</h1>
          <p style="margin:6px 0 0;font-size:13px;opacity:.88;">AI Deadline Rescue Agent</p>
        </div>

        <div style="padding:24px 28px;">
          {completion_note}

          <h2 style="margin:0 0 8px;text-transform:capitalize;color:#1C1B1A;font-size:20px;">{safe_task_name}</h2>
          <p style="margin:0 0 18px;color:#5B564E;font-size:14px;">Status: <strong>{safe_status_label}</strong> | Deadline: <strong>{safe_deadline}</strong></p>

          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
            <div style="background:{risk_color}14;border:1px solid {risk_color}40;border-radius:12px;padding:14px 18px;min-width:120px;">
              <div style="font-size:28px;font-weight:800;color:{risk_color};">{risk_score}%</div>
              <div style="font-size:12px;color:#5B564E;">Risk score</div>
            </div>
            <div style="background:#EEF0FD;border:1px solid #4F46E533;border-radius:12px;padding:14px 18px;min-width:120px;">
              <div style="font-size:28px;font-weight:800;color:#4F46E5;">{html_escape(data.effort_hours)}h</div>
              <div style="font-size:12px;color:#5B564E;">Time required</div>
            </div>
            <div style="background:#F0ECE3;border:1px solid #E7E2D9;border-radius:12px;padding:14px 18px;min-width:120px;">
              <div style="font-size:20px;font-weight:800;color:#1C1B1A;">P{html_escape(data.priority_score)}/10</div>
              <div style="font-size:12px;color:#5B564E;">Priority</div>
            </div>
          </div>

          <div style="background:#FAF8F4;border:1px solid #E7E2D9;border-radius:12px;padding:14px 16px;margin-bottom:18px;color:#5B564E;font-size:14px;">
            {safe_risk_reason}
          </div>

          <div style="display:grid;grid-template-columns:1fr;gap:16px;">
            <div style="border:1px solid #E7E2D9;border-radius:12px;padding:16px;">
              <h3 style="font-size:14px;color:#5B564E;margin:0 0 10px;">Roadmap</h3>
              <ol style="margin:0;padding-left:20px;color:#1C1B1A;font-size:14px;line-height:1.8;">{steps_html}</ol>
            </div>

            <div style="border:1px solid #E7E2D9;border-radius:12px;padding:16px;">
              <h3 style="font-size:14px;color:#5B564E;margin:0 0 10px;">{"Emergency" if data.rescue_mode else "Recommended"} schedule</h3>
              <ul style="margin:0;padding-left:18px;color:#1C1B1A;font-size:14px;line-height:1.8;">{schedule_html}</ul>
              <p style="margin:12px 0 0;color:#4F46E5;font-style:italic;font-size:13px;">{safe_message}</p>
            </div>

            <div style="border:1px solid #E7E2D9;border-radius:12px;padding:16px;">
              <h3 style="font-size:14px;color:#5B564E;margin:0 0 10px;">Future Shock Simulator</h3>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">{shock_html}</table>
            </div>
          </div>

          {extension_html}
          {calendar_button}

          <p style="margin:24px 0 0;color:#9B958A;font-size:12px;text-align:center;">Sent by AI Deadline Rescue Agent</p>
        </div>
      </div>
    </div>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"{headline}: {data.task_name} ({risk_score}% risk)"
        msg["From"] = email_from
        msg["To"] = data.email
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
            server.login(email_from, email_password)
            server.sendmail(email_from, data.email, msg.as_string())

        return {"message": "Email sent successfully"}
    except smtplib.SMTPAuthenticationError as e:
        raise HTTPException(
            status_code=500,
            detail="Gmail authentication failed. Use a Gmail App Password in EMAIL_PASSWORD, not your normal Google password."
        ) from e
    except (smtplib.SMTPException, OSError) as e:
        raise HTTPException(status_code=500, detail=f"Email could not be sent: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reflect")
async def reflect(data: ReflectInput):
    store_task({
        "id": str(uuid.uuid4()),
        "task_name": data.task_name,
        "actual_hours": data.actual_hours,
        "estimated_hours": data.actual_hours,
        "on_time": data.on_time,
        "cognitive_load": data.cognitive_load,
        "best_time": data.best_time,
        "notes": data.notes
    })
    return {"message": "Memory updated. AI will use this for future tasks."}

@app.get("/memories/{task_name}")
async def get_memories(task_name: str):
    memories = retrieve_similar(task_name, n=5)
    return {"memories": memories}
