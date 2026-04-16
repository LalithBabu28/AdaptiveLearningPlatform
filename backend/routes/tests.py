from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models import SubmitTestRequest
import store
from database.db import assignments_collection, students_collection, results_collection


router = APIRouter()


def classify_student(score_percent: float) -> str:
    if score_percent < 40:
        return "Weak"
    elif score_percent <= 75:
        return "Intermediate"
    else:
        return "Advanced"


def find_weak_topics(questions: list, answers: dict) -> list:
    wrong_topics = []
    for q in questions:
        qid = q["id"]
        if answers.get(qid) != q["correct_answer"]:
            if q["topic"] not in wrong_topics:
                wrong_topics.append(q["topic"])
    return wrong_topics


def find_wrong_questions(questions: list, answers: dict) -> list:
    wrong = []
    for q in questions:
        qid = q["id"]
        if answers.get(qid) != q["correct_answer"]:
            wrong.append({
                "id": q["id"],
                "question": q["question"],
                "options": q["options"],
                "correct_answer": q["correct_answer"],
                "student_answer": answers.get(qid),
                "topic": q["topic"],
            })
    return wrong


@router.post("/submit-test")
def submit_test(req: SubmitTestRequest):
    assignment = assignments_collection.find_one({"subject": req.subject})
    if not assignment:
        raise HTTPException(status_code=404, detail=f"No assignment found for {req.subject}")

    student = students_collection.find_one({"email": req.student_email})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # ── Check previous attempt ──────────────────────────────────────────────
    # Find the most recent result for this student + subject
    previous = results_collection.find_one(
        {"student_email": req.student_email, "subject": req.subject},
        sort=[("date_time", -1)]
    )

    if previous:
        prev_classification = previous.get("classification")
        # Non-weak students already completed — block re-attempt
        if prev_classification in ("Intermediate", "Advanced"):
            raise HTTPException(
                status_code=403,
                detail=(
                    f"You have already completed the {req.subject} test "
                    f"with a '{prev_classification}' result. "
                    "Lab access has been granted."
                ),
            )
        # Weak students CAN retake, but check they are using the NEW assignment
        # (the teacher must have regenerated/republished before retake is allowed)
        # We allow retake freely for Weak — the frontend will ensure new MCQs are loaded

    # ── Grade the test ──────────────────────────────────────────────────────
    questions = assignment["questions"]
    total = len(questions)
    correct = 0

    for q in questions:
        if req.answers.get(q["id"]) == q["correct_answer"]:
            correct += 1

    score_percent = (correct / total * 100) if total > 0 else 0
    classification = classify_student(score_percent)
    weak_topics = find_weak_topics(questions, req.answers)
    wrong_questions = find_wrong_questions(questions, req.answers)

    now = datetime.now(timezone.utc).isoformat()
    attempt_number = (results_collection.count_documents(
        {"student_email": req.student_email, "subject": req.subject}
    ) + 1)

    result_record = {
        "student_email": req.student_email,
        "student_name": student["name"],
        "subject": req.subject,
        "score": correct,
        "total": total,
        "score_percent": round(score_percent, 1),
        "classification": classification,
        "weak_topics": weak_topics,
        "wrong_questions": wrong_questions,
        "date_time": now,
        "attempt_number": attempt_number,
    }

    results_collection.insert_one(result_record)

    return {
        "score": correct,
        "total": total,
        "score_percent": round(score_percent, 1),
        "classification": classification,
        "weak_topics": weak_topics,
        "wrong_questions": wrong_questions,
        "date_time": now,
        "attempt_number": attempt_number,
        "message": (
            f"You scored {correct}/{total} ({score_percent:.1f}%). "
            f"Classified as: {classification}"
        ),
    }


@router.get("/results")
def get_results():
    # Return ALL results sorted by most recent first
    results = list(results_collection.find(
        {},
        {"_id": 0}
    ).sort("date_time", -1))
    return {"results": results}


@router.get("/results/{student_email}")
def get_student_results(student_email: str):
    results = list(results_collection.find(
        {"student_email": student_email},
        {"_id": 0}
    ).sort("date_time", -1))
    return {"results": results}


@router.get("/check-attempt/{student_email}/{subject}")
def check_attempt(student_email: str, subject: str):
    """
    Returns the student's latest attempt info for a subject.
    Frontend uses this to decide whether to show 'Start Test' or block.
    """
    latest = results_collection.find_one(
        {"student_email": student_email, "subject": subject},
        sort=[("date_time", -1)]
    )

    if not latest:
        return {"attempted": False, "can_retake": True, "classification": None}

    classification = latest.get("classification")
    can_retake = classification == "Weak"

    return {
        "attempted": True,
        "can_retake": can_retake,
        "classification": classification,
        "score_percent": latest.get("score_percent"),
        "attempt_number": latest.get("attempt_number", 1),
    }