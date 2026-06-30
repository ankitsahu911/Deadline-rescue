from langgraph.graph import StateGraph, END
from typing import TypedDict, List
from langchain_groq import ChatGroq
from dotenv import load_dotenv
from rag.vectordb import retrieve_similar
from calendar_service import get_free_slots
from datetime import datetime
import json

load_dotenv()
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

class AgentState(TypedDict):
    task_name: str
    deadline: str
    description: str
    effort_hours: float
    cognitive_load: str
    priority_score: int
    steps: list
    memories: List[dict]
    free_slots: dict
    risk_score: int
    risk_reason: str
    rescue_mode: bool
    final_plan: dict

def analyze_task_node(state: AgentState) -> dict:
    print("Agent 1: Analyzing task...")
    prompt = f"""
Analyze this task and return ONLY valid JSON, nothing else.

Task: {state['task_name']}
Deadline: {state['deadline']}
Description: {state['description']}

Return exactly:
{{
  "effort_hours": 7,
  "cognitive_load": "deep_focus",
  "priority_score": 9,
  "steps": [
    {{"step": "Research", "duration_minutes": 60}},
    {{"step": "Implementation", "duration_minutes": 240}},
    {{"step": "Testing", "duration_minutes": 120}}
  ]
}}
"""
    response = llm.invoke(prompt)
    try:
        result = json.loads(response.content)
    except:
        result = {"effort_hours": 6, "cognitive_load": "deep_focus", "priority_score": 8, "steps": []}

    return {
        "effort_hours": result["effort_hours"],
        "cognitive_load": result["cognitive_load"],
        "priority_score": result["priority_score"],
        "steps": result["steps"]
    }

def retrieve_memory_node(state: AgentState) -> dict:
    print("Agent 2: Retrieving memories...")
    memories = retrieve_similar(state['task_name'], n=3)
    return {"memories": memories}

def assess_risk_node(state: AgentState) -> dict:
    print("Agent 3: Calculating risk...")
    today = datetime.now().strftime("%Y-%m-%d")

    try:
        slots = get_free_slots(today)
    except:
        slots = {}

    try:
        deadline_dt = datetime.strptime(state['deadline'], "%Y-%m-%d")
        hours_remaining = max((deadline_dt - datetime.now()).total_seconds() / 3600, 0)
    except:
        hours_remaining = 24

    effort = state.get('effort_hours', 5)

    if hours_remaining == 0:
        time_risk = 100
    else:
        time_risk = min(100, (effort / hours_remaining) * 70)

    memories = state.get('memories', [])
    if memories:
        missed = sum(1 for m in memories if not m.get('on_time', True))
        history_risk = (missed / len(memories)) * 30
    else:
        history_risk = 15

    risk_score = min(100, int(time_risk + history_risk))

    if risk_score > 75:
        reason = f"High risk: only {hours_remaining:.1f}h remain but task needs {effort}h"
    elif risk_score > 50:
        reason = f"Moderate risk: tight timeline with {hours_remaining:.1f}h available"
    else:
        reason = f"On track: {hours_remaining:.1f}h available for {effort}h task"

    return {
        "risk_score": risk_score,
        "risk_reason": reason,
        "free_slots": slots,
        "rescue_mode": risk_score > 75
    }

def normal_schedule_node(state: AgentState) -> dict:
    print("Agent 4a: Normal schedule...")
    return {"final_plan": {
        "schedule": [{"time": "18:00", "activity": state['task_name'], "duration": f"{state.get('effort_hours', 5)} hours"}],
        "message": "You can do this! Start now.",
        "start_time": "18:00"
    }}

def rescue_schedule_node(state: AgentState) -> dict:
    print("Agent 4b: RESCUE MODE!")
    return {"final_plan": {
        "emergency_schedule": [{"time": "18:00", "activity": state['task_name'], "duration": "all night"}],
        "message": f"RESCUE MODE: Risk is {state.get('risk_score', 0)}%. Start immediately.",
        "cancelled_tasks": ["gym", "social media"],
        "extension_email": f"Dear Professor, I am writing to request a short extension for {state['task_name']}..."
    }}

def should_rescue(state: AgentState) -> str:
    return "rescue" if state.get('rescue_mode', False) else "normal"

def build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("analyze", analyze_task_node)
    workflow.add_node("retrieve_memory", retrieve_memory_node)
    workflow.add_node("assess_risk", assess_risk_node)
    workflow.add_node("normal_schedule", normal_schedule_node)
    workflow.add_node("rescue_schedule", rescue_schedule_node)

    workflow.set_entry_point("analyze")
    workflow.add_edge("analyze", "retrieve_memory")
    workflow.add_edge("retrieve_memory", "assess_risk")
    workflow.add_conditional_edges(
        "assess_risk",
        should_rescue,
        {
            "rescue": "rescue_schedule",
            "normal": "normal_schedule"
        }
    )
    workflow.add_edge("normal_schedule", END)
    workflow.add_edge("rescue_schedule", END)

    return workflow.compile()

graph = build_graph()
