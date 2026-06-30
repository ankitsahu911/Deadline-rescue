from google_auth_oauthlib.flow import InstalledAppFlow
import json

SCOPES = ['https://www.googleapis.com/auth/calendar']

flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
creds = flow.run_local_server(port=0)

# Save token to file
with open('token.json', 'w') as f:
    f.write(creds.to_json())

print("Success! Token saved to token.json")
print("Access token:", creds.token[:20], "...")