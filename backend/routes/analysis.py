from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.grok_service import call_model, extract_json
import json

router = APIRouter()


class WrongQuestion(BaseModel):
    id: str
    question: str
    options: dict
    correct_answer: str
    student_answer: Optional[str] = None
    topic: str


class AnalyzePerformanceRequest(BaseModel):
    subject: str
    classification: str          # "Weak" | "Intermediate" | "Advanced"
    weak_topics: List[str]
    wrong_questions: List[WrongQuestion]


def _build_weak_prompt(subject: str, weak_topics: list, wrong_questions: list) -> str:
    topics_str = ", ".join(weak_topics) if weak_topics else "general concepts"
    wrong_str = "\n".join(
        f"Q: {q['question']}\n"
        f"  Correct: ({q['correct_answer']}) {q['options'].get(q['correct_answer'], '')}\n"
        f"  Student answered: ({q.get('student_answer', '?')}) "
        f"{q['options'].get(q.get('student_answer', ''), 'not answered')}"
        for q in wrong_questions[:10]
    )

    return f"""You are an expert tutor for {subject}.

A student scored below 40% and needs comprehensive help.

Weak topics: {topics_str}

Wrong questions the student answered:
{wrong_str}

Please provide a JSON response (only JSON, no markdown) in this exact format:
{{
  "topic_explanations": [
    {{
      "topic": "<topic name>",
      "explanation": "<2-3 paragraph clear conceptual explanation with examples>",
      "key_points": ["point 1", "point 2", "point 3"]
    }}
  ],
  "wrong_answer_explanations": [
    {{
      "question": "<question text>",
      "why_correct": "<why the correct answer is right>",
      "common_mistake": "<why students pick the wrong option>",
      "tip": "<a memorable tip to remember this>"
    }}
  ],
  "study_plan": "<2-3 sentences: what to study first and how>"
}}"""


def _build_intermediate_prompt(subject: str, wrong_questions: list) -> str:
    wrong_str = "\n".join(
        f"Q: {q['question']}\n"
        f"  Correct: ({q['correct_answer']}) {q['options'].get(q['correct_answer'], '')}\n"
        f"  Student answered: ({q.get('student_answer', '?')}) "
        f"{q['options'].get(q.get('student_answer', ''), 'not answered')}"
        for q in wrong_questions[:10]
    )

    return f"""You are an expert tutor for {subject}.

A student scored between 40-75%. They need explanations for their incorrect answers only.

Wrong questions:
{wrong_str}

Please provide a JSON response (only JSON, no markdown) in this exact format:
{{
  "wrong_answer_explanations": [
    {{
      "question": "<question text>",
      "why_correct": "<why the correct answer is right>",
      "common_mistake": "<why students pick the wrong option>",
      "tip": "<a memorable tip to remember this>"
    }}
  ],
  "encouragement": "<1-2 sentence motivational message about their progress>"
}}"""

@router.post("/analyze-performance")
async def analyze_performance(req: AnalyzePerformanceRequest):
    wrong_q_dicts = [q.dict() for q in req.wrong_questions]

    try:
        # ✅ Step 1: Choose prompt
        if req.classification == "Weak":
            prompt = _build_weak_prompt(
                req.subject, req.weak_topics, wrong_q_dicts
            )

        elif req.classification == "Intermediate":
            prompt = _build_intermediate_prompt(
                req.subject, wrong_q_dicts
            )

        else:
            # ✅ Advanced — return directly
            return {
                "classification": "Advanced",
                "topic_explanations": [],
                "wrong_answer_explanations": [],
                "study_plan": None,
                "encouragement": "Excellent work! You have direct access to lab assignments.",
            }

        # ✅ Step 2: Call AI
        raw = await call_model(
            [{"role": "user", "content": prompt}],
            max_tokens=2500,
        )

        # ✅ Step 3: Parse JSON safely
        data = extract_json(raw)

        # ✅ Step 4: Normalize structure
        if isinstance(data, list):
            data = {
                "topic_explanations": data,
                "wrong_answer_explanations": [],
                "study_plan": None,
                "encouragement": None,
            }

        elif not isinstance(data, dict):
            raise HTTPException(
                status_code=500,
                detail="Invalid AI response format",
            )

        # ✅ Step 5: Return safe response
        return {
            "classification": req.classification,
            "topic_explanations": data.get("topic_explanations", []),
            "wrong_answer_explanations": data.get("wrong_answer_explanations", []),
            "study_plan": data.get("study_plan"),
            "encouragement": data.get("encouragement"),
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Performance analysis failed: {str(e)}",
        )