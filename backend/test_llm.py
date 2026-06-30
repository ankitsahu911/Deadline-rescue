print("Script started")

from dotenv import load_dotenv
from langchain_groq import ChatGroq

load_dotenv()

llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
response = llm.invoke("Say hello and tell me what model you are.")
print(response.content)