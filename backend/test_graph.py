import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from graph.workflow import graph

print("Testing LangGraph workflow...\n")

initial_state = {
    "task_name": "machine learning assignment",
    "deadline": "2026-06-27",
    "description": "Build a classification model",
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

print("\n===== FINAL RESULT =====")
print(f"Effort: {result['effort_hours']} hours")
print(f"Risk Score: {result['risk_score']}%")
print(f"Risk Reason: {result['risk_reason']}")
print(f"Rescue Mode: {result['rescue_mode']}")
print(f"Plan: {result['final_plan']}")