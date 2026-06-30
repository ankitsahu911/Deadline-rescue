import os
from pathlib import Path
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/calendar']
BASE_DIR = Path(__file__).resolve().parent
CREDENTIALS_PATH = BASE_DIR / 'credentials.json'
TOKEN_PATH = BASE_DIR / 'token.json'

def get_calendar_service():
    creds = None

    # Load saved token if exists
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    # If no valid credentials, login
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as exc:
                raise RuntimeError(
                    "Google Calendar token could not be refreshed. Run backend/test_auth.py once to create a fresh token.json."
                ) from exc
        else:
            if not CREDENTIALS_PATH.exists():
                raise RuntimeError("Missing backend/credentials.json for Google Calendar OAuth.")
            if os.getenv("GOOGLE_CALENDAR_INTERACTIVE_AUTH") != "1":
                raise RuntimeError(
                    "Google Calendar is not authorized. Run backend/test_auth.py once, or set GOOGLE_CALENDAR_INTERACTIVE_AUTH=1 for local OAuth setup."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

        # Save token for next time
        TOKEN_PATH.write_text(creds.to_json(), encoding='utf-8')

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

    try:
        hour = int(start_hour)
        if hour < 0 or hour > 23:
            raise ValueError
    except (TypeError, ValueError) as exc:
        raise ValueError("start_hour must be an integer from 0 to 23.") from exc

    try:
        duration = float(duration_hours)
    except (TypeError, ValueError) as exc:
        raise ValueError("duration_hours must be a number.") from exc
    duration = max(0.25, min(duration, 24))

    try:
        start_time = datetime.strptime(f"{date_str} {hour}:00", "%Y-%m-%d %H:%M")
    except ValueError as exc:
        raise ValueError("date must be in YYYY-MM-DD format.") from exc

    end_time = start_time + timedelta(hours=duration)

    event = {
        'summary': f"AI Deadline Rescue - {title}",
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
