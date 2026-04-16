import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from models import GenerateMCQRequest, PublishAssignmentRequest
from services.grok_service import generate_mcq_questions
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
    """
    Publishing a NEW assignment bumps the assignment_version.
    This allows all students to attempt again fresh.
    """
    new_version = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    assignments_collection.update_one(
        {"subject": req.subject},
        {
            "$set": {
                "title": req.title,
                "subject": req.subject,
                "questions": [q.dict() for q in req.questions],
                "assignment_version": new_version,
                "published_at": now,
            }
        },
        upsert=True,
    )
    return {"success": True, "assignment_version": new_version}


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
        "assignment_version": assignment.get("assignment_version", "v1"),
    }


@router.post("/regenerate-for-weak")
async def regenerate_for_weak(student_email: str, subject: str):
    """
    Generates a completely fresh set of MCQs focused on the student's weak topics.
    Only available for students classified as Weak on their latest attempt.
    Respects attempt limits: Weak students can retake unlimited times (they need to improve).
    """
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

    personal_key = f"{subject}__{student_email}"
    new_version = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    assignments_collection.update_one(
        {"subject": personal_key},
        {
            "$set": {
                "title": f"{subject} - Retake ({topic_str})",
                "subject": personal_key,
                "original_subject": subject,
                "questions": questions,
                "assignment_version": new_version,
                "published_at": now,
                "retake_type": "weak",
            }
        },
        upsert=True,
    )

    return {
        "title": f"{subject} - Personalised Retake (Weak Topics)",
        "subject": subject,
        "assignment_version": new_version,
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


@router.post("/regenerate-for-intermediate")
async def regenerate_for_intermediate(student_email: str, subject: str):
    """
    Generates a moderate-difficulty set for Intermediate students.
    Limited to a maximum of 2 total attempts per assignment version.
    """
    # Get the current published assignment version
    published = assignments_collection.find_one({"subject": subject})
    if not published:
        raise HTTPException(status_code=404, detail="No assignment found")

    current_version = published.get("assignment_version", "v1")

    # Count attempts on this specific assignment version
    attempt_count = results_collection.count_documents({
        "student_email": student_email,
        "subject": subject,
        "assignment_version": current_version,
    })

    if attempt_count >= 2:
        raise HTTPException(
            status_code=403,
            detail="Maximum 2 attempts allowed per assignment for Intermediate students.",
        )

    # Get latest result to find wrong topics
    latest = results_collection.find_one(
        {"student_email": student_email, "subject": subject},
        sort=[("date_time", -1)],
    )

    if not latest or latest.get("classification") != "Intermediate":
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only for Intermediate students.",
        )

    weak_topics = latest.get("weak_topics", [])
    topic_str = ", ".join(weak_topics) if weak_topics else subject

    try:
        questions = await generate_mcq_questions(subject, topic_str)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate questions: {str(e)}"
        )

    personal_key = f"{subject}__intermediate__{student_email}"
    new_version = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    assignments_collection.update_one(
        {"subject": personal_key},
        {
            "$set": {
                "title": f"{subject} - Improvement Attempt",
                "subject": personal_key,
                "original_subject": subject,
                "questions": questions,
                "assignment_version": new_version,
                "published_at": now,
                "retake_type": "intermediate",
                "base_version": current_version,
            }
        },
        upsert=True,
    )

    return {
        "title": f"{subject} - Improvement Attempt",
        "subject": subject,
        "assignment_version": new_version,
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