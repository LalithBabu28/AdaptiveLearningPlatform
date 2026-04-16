import fitz  # PyMuPDF
import requests


def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    
    for page in doc:
        text += page.get_text()
    
    return text
 

def get_topic_content(text, topic):
    lines = text.split("\n")
    
    filtered = []
    for line in lines:
        if topic.lower() in line.lower():
            filtered.append(line)
    
    return " ".join(filtered[:50])  # limit size

#print(context)

def call_mistral(prompt):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "mistral",
            "prompt": prompt,
            "stream": False
        }
    )
    
    return response.json()["response"]


def generate_mcqs(context, topic):
    prompt = f"""
You are a strict JSON generator.

Generate exactly 10 MCQs for topic "{topic}".

Context:
{context}

Rules:
- Return ONLY JSON
- No explanation
- No text outside JSON

Format:
[
  {{
    "id": "q1",
    "question": "...",
    "options": {{"a":"...","b":"...","c":"...","d":"..."}},
    "correct_answer": "a",
    "topic": "{topic}"
  }}
]
"""

    return call_mistral(prompt)

if __name__ == "__main__":
    pdf_text = extract_text("Dsa.pdf")
    
    topic = "stack"
    
    context = get_topic_content(pdf_text, topic)
    
    mcqs = generate_mcqs(context, topic)
    
    print("\n===== GENERATED MCQs =====\n")
    print(mcqs) 