
import json
import httpx
from typing import List
import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

# ================================
# CONFIG
# ================================
API_KEY = os.getenv("GROQ_API_KEY")
BASE_URL = "https://api.groq.com/openai/v1"

# ================================
# CORE MODEL CALL
# ================================
async def call_model(messages: list, max_tokens: int = 2000) -> str:
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "llama-3.1-8b-instant",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7
    }

    retries = 3
    delay = 1  # seconds

    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt in range(retries):
            try:
                response = await client.post(
                    f"{BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload
                )

                print("\n===== DEBUG =====")
                print("STATUS:", response.status_code)
                print("RAW RESPONSE:", response.text)
                print("=================\n")

                if response.status_code == 429:
                    if attempt < retries - 1:
                        await asyncio.sleep(delay)
                        delay *= 2
                        continue
                    else:
                        raise Exception("Rate limit exceeded (429)")

                response.raise_for_status()

                data = response.json()
                return data["choices"][0]["message"]["content"]

            except Exception as e:
                if attempt < retries - 1:
                    await asyncio.sleep(delay)
                    delay *= 2
                else:
                    raise e


def extract_json(raw: str):
    import json
    import re

    raw = raw.strip()

    # Step 1: Remove markdown fences safely
    raw = re.sub(r"```json", "", raw)
    raw = re.sub(r"```", "", raw)

    # Step 2: Try direct parse
    try:
        return json.loads(raw)
    except:
        pass

    # Step 3: Extract largest JSON object
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except:
            pass

    # Step 4: Extract JSON array
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except:
            pass

    raise ValueError(f"Invalid JSON from model:\n{raw[:500]}")

# ================================
# MCQ GENERATION
# ================================
async def generate_mcq_questions(subject: str, topic: str) -> List[dict]:
    prompt = f"""
You are an expert educational assessment generator.

Your task is to generate EXACTLY 10 high-quality MCQs that fully evaluate a student's understanding of the topic.

Subject: {subject}
Topic: {topic}

STRICT REQUIREMENTS:

1. Coverage:
- Questions must cover DIFFERENT sub-concepts within the topic
- Avoid repeating the same idea in different wording
- Ensure broad conceptual coverage

2. Difficulty Distribution:
- 3 Easy (basic understanding)
- 4 Medium (application & reasoning)
- 3 Hard (deep conceptual / tricky / edge cases)

3. Question Quality:
- Focus on "why" and "how", not just definitions
- Include scenario-based or application-based questions where possible
- Avoid direct textbook or memorization questions

4. Options Quality:
- All 4 options must be plausible
- Include common misconceptions as distractors
- Avoid obvious wrong answers

5. Uniqueness:
- No duplicate or rephrased questions
- Each question must test a UNIQUE concept or angle

6. Output Rules:
- Return ONLY valid JSON
- No explanation, no markdown, no extra text
- Output must be a JSON array of 10 objects

FORMAT:
[
  {{
    "id": "q1",
    "question": "...",
    "options": {{
      "a": "...",
      "b": "...",
      "c": "...",
      "d": "..."
    }},
    "correct_answer": "a",
    "difficulty": "easy/medium/hard",
    "concept": "specific subtopic being tested",
    "topic": "{topic}"
  }}
]
"""
    try:
        raw = await call_model([
            {"role": "user", "content": prompt}
        ])

        print("RAW MODEL OUTPUT:", raw)

        data = extract_json(raw)

        if isinstance(data, dict) and "questions" in data:
            questions = data["questions"]
        elif isinstance(data, list):
            questions = data
        else:
            raise ValueError("Invalid JSON structure")

        # Ensure exactly 10 questions
        if not isinstance(questions, list) or len(questions) != 10:
            raise ValueError("Invalid number of questions")

        for q in questions:
            if (
                "question" not in q or
                "options" not in q or
                "correct_answer" not in q
            ):
                raise ValueError("Invalid MCQ format")

        for i, q in enumerate(questions):
            q["id"] = f"q{i+1}"

        return questions

    except Exception as e:
        print("MCQ ERROR:", e)

        # ✅ CRITICAL FIX: return fallback instead of crashing
        return generate_mock_questions(subject, topic)
# ================================
# FALLBACK (MOCK DATA)
# ================================
def generate_mock_questions(subject: str, topic: str):
    return [
        {
            "id": f"q{i+1}",
            "question": f"Sample question {i+1} about {topic} in {subject}?",
            "options": {
                "a": "Option A",
                "b": "Option B",
                "c": "Option C",
                "d": "Option D"
            },
            "correct_answer": "a",
            "topic": topic
        }
        for i in range(10)
    ]

# ================================
# TUTOR CHAT FUNCTION
# ================================

def format_tutor_response(raw: str) -> str:
    import re

    # Force-split any inline numbered patterns like "1. ... 2. ... 3. ..."
    # This handles cases where model ignores formatting instructions
    raw = re.sub(r'\s+(\d+\.)\s+', r'\n\1 ', raw)

    lines = raw.strip().splitlines()
    formatted_steps = []
    closing_question = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # If line ends with '?' and is NOT a numbered step → it's the closing question
        if line.endswith('?') and not re.match(r'^\d+\.', line):
            closing_question = line
        else:
            formatted_steps.append(line)

    # Join steps with double newline so each is clearly separated
    result = '\n\n'.join(formatted_steps)

    if closing_question:
        result += f'\n\n---\n\n💬 {closing_question}'

    return result


async def get_tutor_response(message: str, subject: str, history: list) -> str:

    system_prompt = """You are a Socratic learning tutor. Your role is to guide students to discover answers on their own through structured thinking, not to provide direct solutions.

CORE BEHAVIOR:
- Never provide the full solution or final answer
- Never write complete code for the student
- Always guide step-by-step using hints
- Encourage reasoning, not memorization
- Adapt your hint based on the student’s question (conceptual, debugging, logic, etc.)

OUTPUT FORMAT RULES:
- Respond using numbered steps only
- Each step must be on a new line
- Each step must be 1–2 sentences maximum
- Do not combine multiple steps into one line
- Do not use paragraphs or long explanations

TEACHING STRATEGY:
1. Identify the core concept behind the student’s question
2. Prompt the student to recall or recognize that concept
3. Help them break the problem into smaller parts
4. Guide them to the correct starting point
5. Provide ONE logical hint at a time
6. If the student is stuck, give a minimal directional clue (not the answer)
7. Use analogies only if necessary and keep them brief

DEBUGGING / ERROR HANDLING:
- If the student shares code or an error:
  - Do NOT fix the code directly
  - Help them locate where the issue might be
  - Guide them to inspect specific lines or logic
  - Ask targeted questions about expected vs actual behavior

LANGUAGE RULES:
- Use precise and simple technical language
- Avoid vague hints like "think about it"
- Clearly name concepts (e.g., loop, condition, API call, database query)
- Avoid revealing the final implementation

MANDATORY ENDING RULE:
- Always end with exactly ONE question
- The question must guide the student to the next step
- Place the question after a blank line
- Do not label the question

ADAPTIVE DIFFICULTY:
- If the student seems beginner → give slightly more structured hints
- If the student seems advanced → give minimal, sharper hints

GOAL:
Help the student arrive at the solution independently by thinking step-by-step.
"""

    messages = [
        {"role": "system", "content": system_prompt}
    ]

    # Add last 6 messages of history for context
    for h in history[-6:]:
        messages.append({
            "role": h["role"],
            "content": h["content"]
        })

    messages.append({
        "role": "user",
        "content": f"[Subject: {subject}]\nStudent question: {message}"
    })

    try:
        raw_response = await call_model(messages, max_tokens=350)
        formatted = format_tutor_response(raw_response)
        return formatted

    except Exception as e:
        print("TUTOR ERROR:", e)
        raise Exception(f"Tutor response generation failed: {str(e)}")