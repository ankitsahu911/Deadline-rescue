from dotenv import load_dotenv
import os
load_dotenv()
print('GROQ_KEY', bool(os.getenv('GROQ_API_KEY')))
print('GROQ_VAL', os.getenv('GROQ_API_KEY')[:8] if os.getenv('GROQ_API_KEY') else None)
print('CWD', os.getcwd())
print('FILE', os.path.exists('backend\\test_llm.py'))
print('FILE PATH', os.path.abspath('backend\\test_llm.py'))
print('FILE CONTENT:')
with open('backend\\test_llm.py', 'r', encoding='utf-8') as f:
    print(f.read())
from langchain_groq import ChatGroq
llm = ChatGroq(model='llama-3.3-70b-versatile', temperature=0, api_key=os.getenv('GROQ_API_KEY'))
print('LLM', llm)
response = llm.invoke('Say hello and tell me what model you are.')
print('RESPONSE', repr(response))
if hasattr(response, 'content'):
    print('CONTENT', repr(response.content))
if hasattr(response, 'text'):
    print('TEXT', repr(response.text))
if hasattr(response, 'message'):
    print('MESSAGE', repr(response.message))
