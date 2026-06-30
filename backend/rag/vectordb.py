import chromadb
import hashlib
import math
import re

# Create local ChromaDB
client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection("user_history")

def embed(text: str) -> list[float]:
    vector = [0.0] * 384
    words = re.findall(r"[a-z0-9]+", text.lower())
    for word in words:
        digest = hashlib.sha256(word.encode("utf-8")).digest()
        index = int.from_bytes(digest[:2], "big") % len(vector)
        vector[index] += 1.0

    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]

def store_task(task: dict):
    text = f"{task['task_name']} took {task['actual_hours']} hours. Completed on time: {task['on_time']}. Best time: {task['best_time']}. Type: {task['cognitive_load']}"
    collection.add(
        documents=[text],
        embeddings=[embed(text)],
        ids=[task['id']],
        metadatas=[task]
    )

def retrieve_similar(task_name: str, n: int = 3):
    if collection.count() == 0:
        return []

    results = collection.query(
        query_embeddings=[embed(task_name)],
        n_results=min(n, collection.count())
    )
    if results and results['metadatas']:
        return results['metadatas'][0]
    return []
