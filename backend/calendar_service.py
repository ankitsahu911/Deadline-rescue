import os
import json
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/calendar']

def get_calendar_service():
    creds = None

    # Load saved token if exists
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    # If no valid credentials, login
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)

        # Save token for next time
        with open('token.json', 'w') as f:
            f.write(creds.to_json())

    return build('calendar', 'v3', credentials=creds)

def get_free_slots(date_str: str):
    """Get free time slots for a given date"""
    service = get_calendar_service()

    # Get start and end of the day
    start = f"{date_str}T00:00:00+05:30"
    end = f"{date_str}T23:59:59+05:30"

    events_result = service.events().list(
        calendarId='primary',
        timeMin=start,
        timeMax=end,
        singleEvents=True,
        orderBy='startTime'
    ).execute()

    events = events_result.get('items', [])

    # Build busy slots
    busy_slots = []
    for event in events:
        start_time = event['start'].get('dateTime', event['start'].get('date'))
        end_time = event['end'].get('dateTime', event['end'].get('date'))
        busy_slots.append({"start": start_time, "end": end_time, "title": event.get('summary', 'Busy')})

    return {
        "date": date_str,
        "busy_slots": busy_slots,
        "total_events": len(events)
    }

def create_event(title: str, date_str: str, start_hour: int, duration_hours: float, description: str = ""):
    """Create a calendar event"""
    service = get_calendar_service()

    start_time = datetime.strptime(f"{date_str} {start_hour}:00", "%Y-%m-%d %H:%M")
    end_time = start_time + timedelta(hours=duration_hours)

    event = {
        'summary': f"🤖 {title}",
        'description': f"Scheduled by AI Deadline Rescue\n\n{description}",
        'start': {
            'dateTime': start_time.isoformat()+'+05:30',
            'timeZone': 'Asia/Kolkata',
        },
        'end': {
            'dateTime': end_time.isoformat()+'+05:30',
            'timeZone': 'Asia/Kolkata',
        },
        'colorId': '11',
    }

    created = service.events().insert(calendarId='primary', body=event).execute()
    return {
        "event_id": created['id'],
        "title": title,
        "start": start_time.strftime("%Y-%m-%d %H:%M"),
        "end": end_time.strftime("%Y-%m-%d %H:%M"),
        "link": created.get('htmlLink')
    }

def mark_event_completed(event_id: str):
    """Mark an existing calendar event as completed."""
    service = get_calendar_service()

    existing = service.events().get(
        calendarId='primary',
        eventId=event_id
    ).execute()

    summary = existing.get('summary', 'Task')
    if not summary.startswith('DONE - '):
        summary = f"DONE - {summary}"

    description = existing.get('description', '')
    if 'Marked complete from AI Deadline Rescue.' not in description:
        description = f"{description}\n\nMarked complete from AI Deadline Rescue.".strip()

    updated = service.events().patch(
        calendarId='primary',
        eventId=event_id,
        body={
            'summary': summary,
            'description': description,
            'colorId': '10'
        }
    ).execute()

    return {
        "event_id": updated['id'],
        "status": "completed",
        "link": updated.get('htmlLink')
    }
