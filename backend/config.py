# config.py — change LLM_PROVIDER to switch instantly

import importlib
import os
from dotenv import load_dotenv
load_dotenv()

LLM_PROVIDER = "groq"  # "groq" | "gemini" | "ollama"

def get_llm():
    if LLM_PROVIDER == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(
            model="llama-3.3-70b-versatile",
            api_key=os.getenv("GROQ_API_KEY"),
            temperature=0
        )

    elif LLM_PROVIDER == "gemini":
        try:
            ChatGoogleGenerativeAI = importlib.import_module("langchain_google_genai").ChatGoogleGenerativeAI
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "gemini provider requires the langchain_google_genai package"
            ) from exc
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=os.getenv("GOOGLE_AI_KEY"),
            temperature=0
        )

    elif LLM_PROVIDER == "ollama":
        try:
            ChatOllama = importlib.import_module("langchain_ollama").ChatOllama
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "ollama provider requires the langchain_ollama package"
            ) from exc
        return ChatOllama(model="llama3.2", temperature=0)


def get_embedder():
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('all-MiniLM-L6-v2')
    return lambda text: model.encode(text).tolist()


# Usage everywhere else in your project:
# from config import get_llm, get_embedder
# llm = get_llm()
# embed = get_embedder()