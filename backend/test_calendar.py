from calendar_service import get_free_slots, create_event
from datetime import datetime

# Get today's date
today = datetime.now().strftime("%Y-%m-%d")

print("Fetching your calendar for today...")
slots = get_free_slots(today)
print(f"Date: {slots['date']}")
print(f"Events today: {slots['total_events']}")
for event in slots['busy_slots']:
    print(f"  - {event['title']}: {event['start']} to {event['end']}")

print("\nCreating a test event...")
event = create_event(
    title="Test - AI Deadline Rescue",
    date_str=today,
    start_hour=23,
    duration_hours=0.5,
    description="This is a test event created by your AI"
)
print(f"Created: {event['title']}")
print(f"Time: {event['start']} → {event['end']}")
print(f"Link: {event['link']}")