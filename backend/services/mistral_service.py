import json
import re
import requests
import fitz

# ================================
# PDF UTILS
# ================================
def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text


def get_topic_content(text, topic):
    lines = text.split("\n")
    filtered = [line for line in lines if topic.lower() in line.lower()]
    return " ".join(filtered[:50])


# ================================
# LOCAL MISTRAL CALL
# ================================
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


# ================================
# JSON PARSER
# ================================
def parse_mcqs(raw):
    try:
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        cleaned = match.group(0) if match else raw
        return json.loads(cleaned)
    except Exception:
        print("RAW OUTPUT:", raw)
        raise Exception("Mistral JSON parsing failed")


# ================================
# MCQ GENERATION (LOCAL MISTRAL)
# ================================
def generate_mcq_from_pdf(topic: str):

    import os

    BASE_DIR = os.path.dirname(__file__)
    PDF_PATH = os.path.join(BASE_DIR, "Dsa.pdf")
    
    print("PDF PATH:", PDF_PATH)
    print("EXISTS:", os.path.exists(PDF_PATH))
    
    pdf_text = extract_text(PDF_PATH)
    context = get_topic_content(pdf_text, topic)
    
    print("CONTEXT:", context[:200])

    prompt = f"""
You are a strict JSON generator.

Generate exactly 10 MCQs for topic "{topic}" in Data Structures.

Context:
{context}

Rules:
- Return ONLY JSON
- No explanation
- No markdown
- Output must be a JSON array
- STRICTLY RETURN VALID JSON OR []
"""

    raw = call_mistral(prompt)

    questions = parse_mcqs(raw)
    for i, q in enumerate(questions):
        q["id"] = f"q{i+1}"

    return questions