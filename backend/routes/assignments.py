import asyncio

from fastapi import APIRouter, HTTPException
from models import GenerateMCQRequest, PublishAssignmentRequest
from services.grok_service import generate_mcq_questions
import store
from database.db import assignments_collection, results_collection

router = APIRouter()

SUBJECTS = ["DSA", "DBMS", "Compiler Design"]


@router.post("/generate-mcq")
async def generate_mcq(req: GenerateMCQRequest):
    if req.subject not in SUBJECTS:
        raise HTTPException(status_code=400, detail="Invalid subject")

    try:
        questions = await generate_mcq_questions(req.subject, req.topic)
        return {
            "questions": questions or [],
            "subject": req.subject,
            "topic": req.topic,
        }

    except Exception as e:
        return {"questions": [], "error": str(e)}


@router.post("/publish-assignment")
def publish_assignment(req: PublishAssignmentRequest):
    assignments_collection.update_one(
        {"subject": req.subject},
        {
            "$set": {
                "title": req.title,
                "subject": req.subject,
                "questions": [q.dict() for q in req.questions],
            }
        },
        upsert=True,
    )
    return {"success": True}


@router.get("/assignments/{subject}")
def get_assignment(subject: str):
    assignment = assignments_collection.find_one({"subject": subject})
    if not assignment:
        raise HTTPException(status_code=404, detail="No assignment found")

    questions = []
    for q in assignment["questions"]:
        questions.append({
            "id": q["id"],
            "question": q["question"],
            "options": q["options"],
            "topic": q["topic"],
        })

    return {
        "title": assignment["title"],
        "subject": assignment["subject"],
        "questions": questions,
    }


@router.post("/regenerate-for-weak")
async def regenerate_for_weak(student_email: str, subject: str):
    """
    Called when a Weak student wants to retake a test.
    Generates a completely fresh set of MCQs on the SAME topics they were weak on,
    stores them as a temporary personalised assignment keyed to the student,
    and returns the questions directly to the frontend.
    """
    # Find their latest result to know which topics to focus on
    latest = results_collection.find_one(
        {"student_email": student_email, "subject": subject},
        sort=[("date_time", -1)],
    )

    if not latest or latest.get("classification") != "Weak":
        raise HTTPException(
            status_code=403,
            detail="Regeneration is only available for Weak students.",
        )

    weak_topics = latest.get("weak_topics", [])
    topic_str = ", ".join(weak_topics) if weak_topics else subject

    try:
        questions = await generate_mcq_questions(subject, topic_str)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate new questions: {str(e)}"
        )

    # Store as a personalised assignment for this student
    # Key: subject__studentemail so it doesn't overwrite the main assignment
    personal_key = f"{subject}__{student_email}"
    assignments_collection.update_one(
        {"subject": personal_key},
        {
            "$set": {
                "title": f"{subject} - Retake ({topic_str})",
                "subject": personal_key,
                "original_subject": subject,
                "questions": questions,
            }
        },
        upsert=True,
    )

    return {
        "title": f"{subject} - Personalised Retake",
        "subject": subject,
        "questions": [
            {
                "id": q["id"],
                "question": q["question"],
                "options": q["options"],
                "topic": q.get("topic", topic_str),
            }
            for q in questions
        ],
    }