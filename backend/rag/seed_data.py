import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.vectordb import store_task

PAST_TASKS = [
    {"id": "t001", "task_name": "machine learning assignment", "actual_hours": 7.5, "estimated_hours": 4, "on_time": False, "cognitive_load": "deep_focus", "best_time": "evening", "day": "Saturday"},
    {"id": "t002", "task_name": "data structures assignment", "actual_hours": 5, "estimated_hours": 3, "on_time": True, "cognitive_load": "deep_focus", "best_time": "morning", "day": "Sunday"},
    {"id": "t003", "task_name": "research paper review", "actual_hours": 3, "estimated_hours": 2, "on_time": True, "cognitive_load": "deep_focus", "best_time": "morning", "day": "Monday"},
    {"id": "t004", "task_name": "python coding project", "actual_hours": 9, "estimated_hours": 5, "on_time": False, "cognitive_load": "deep_focus", "best_time": "night", "day": "Friday"},
    {"id": "t005", "task_name": "presentation slides", "actual_hours": 2, "estimated_hours": 2, "on_time": True, "cognitive_load": "creative", "best_time": "afternoon", "day": "Wednesday"},
    {"id": "t006", "task_name": "college exam preparation", "actual_hours": 10, "estimated_hours": 6, "on_time": True, "cognitive_load": "deep_focus", "best_time": "morning", "day": "Sunday"},
    {"id": "t007", "task_name": "neural network implementation", "actual_hours": 8, "estimated_hours": 4, "on_time": False, "cognitive_load": "deep_focus", "best_time": "evening", "day": "Saturday"},
    {"id": "t008", "task_name": "database assignment", "actual_hours": 4, "estimated_hours": 3, "on_time": True, "cognitive_load": "mechanical", "best_time": "afternoon", "day": "Tuesday"},
    {"id": "t009", "task_name": "internship report writing", "actual_hours": 3, "estimated_hours": 2, "on_time": True, "cognitive_load": "shallow", "best_time": "morning", "day": "Monday"},
    {"id": "t010", "task_name": "hackathon project", "actual_hours": 18, "estimated_hours": 10, "on_time": True, "cognitive_load": "deep_focus", "best_time": "night", "day": "Saturday"},
    {"id": "t011", "task_name": "algorithm design assignment", "actual_hours": 6, "estimated_hours": 3, "on_time": False, "cognitive_load": "deep_focus", "best_time": "evening", "day": "Thursday"},
    {"id": "t012", "task_name": "web development project", "actual_hours": 7, "estimated_hours": 5, "on_time": True, "cognitive_load": "creative", "best_time": "afternoon", "day": "Sunday"},
    {"id": "t013", "task_name": "mathematics assignment", "actual_hours": 4, "estimated_hours": 3, "on_time": True, "cognitive_load": "deep_focus", "best_time": "morning", "day": "Wednesday"},
    {"id": "t014", "task_name": "software testing report", "actual_hours": 2.5, "estimated_hours": 2, "on_time": True, "cognitive_load": "mechanical", "best_time": "afternoon", "day": "Tuesday"},
    {"id": "t015", "task_name": "api integration assignment", "actual_hours": 5, "estimated_hours": 3, "on_time": False, "cognitive_load": "deep_focus", "best_time": "evening", "day": "Friday"},
]

if __name__ == "__main__":
    print("Seeding database with past task history...")
    for task in PAST_TASKS:
        store_task(task)
        print(f"Stored: {task['task_name']}")
    print(f"\nDone. {len(PAST_TASKS)} tasks stored in memory.")
