from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models import SubmitTestRequest
from database.db import assignments_collection, students_collection, results_collection

router = APIRouter()

MAX_INTERMEDIATE_ATTEMPTS = 2


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
            topic = q.get("topic", "General")  # ✅ safe fallback
            if topic not in wrong_topics:
                wrong_topics.append(topic)
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
                "topic": q.get("topic", "General"),  # ✅ safe fallback (was q["topic"] → KeyError)
            })
    return wrong


@router.post("/submit-test")
def submit_test(req: SubmitTestRequest):
    # ── Resolve assignment (could be personalised or main) ──────────────────
    intermediate_key = f"{req.subject}__intermediate__{req.student_email}"
    weak_key = f"{req.subject}__{req.student_email}"

    assignment = (
        assignments_collection.find_one({"subject": intermediate_key})
        or assignments_collection.find_one({"subject": weak_key})
        or assignments_collection.find_one({"subject": req.subject})
    )

    if not assignment:
        raise HTTPException(status_code=404, detail=f"No assignment found for {req.subject}")

    student = students_collection.find_one({"email": req.student_email})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    assignment_version = assignment.get("assignment_version", "v1")

    # ── Fetch latest result (any version) ──────────────────────────────────
    previous = results_collection.find_one(
        {"student_email": req.student_email, "subject": req.subject},
        sort=[("date_time", -1)],
    )

    # ── Attempt-control rules ───────────────────────────────────────────────
    if previous:
        prev_classification = previous.get("classification")
        prev_version = previous.get("assignment_version", "v1")

        # Get the CURRENT published (non-personalised) assignment version
        published_assignment = assignments_collection.find_one({"subject": req.subject})
        published_version = published_assignment.get("assignment_version", "v1") if published_assignment else "v1"

        # If the teacher published a brand-new assignment → allow fresh attempt
        is_new_assignment = (prev_version != published_version)

        if not is_new_assignment:
            if prev_classification == "Advanced":
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"You have already completed the {req.subject} test "
                        "with an 'Advanced' result. Lab access is granted. "
                        "Advanced students cannot retake."
                    ),
                )

            if prev_classification == "Intermediate":
                version_attempts = results_collection.count_documents({
                    "student_email": req.student_email,
                    "subject": req.subject,
                    "assignment_version": {"$in": [assignment_version, published_version]},
                })
                if version_attempts >= MAX_INTERMEDIATE_ATTEMPTS:
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            f"You have used all {MAX_INTERMEDIATE_ATTEMPTS} attempts "
                            f"for the current {req.subject} assignment. "
                            "Your lab access is already unlocked."
                        ),
                    )

            # Weak students: always allowed to retake (no cap)

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
    attempt_number = (
        results_collection.count_documents(
            {"student_email": req.student_email, "subject": req.subject}
        )
        + 1
    )

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
        "assignment_version": assignment_version,
    }

    results_collection.insert_one(result_record)
    result_record.pop("_id", None)  # ✅ remove MongoDB ObjectId — not JSON serializable

    # Clean up the used personalised assignment so it doesn't linger
    for pkey in [intermediate_key, weak_key]:
        if assignment.get("subject") == pkey:
            assignments_collection.delete_one({"subject": pkey})
            break

    return {
        "score": correct,
        "total": total,
        "score_percent": round(score_percent, 1),
        "classification": classification,
        "weak_topics": weak_topics,
        "wrong_questions": wrong_questions,
        "date_time": now,
        "attempt_number": attempt_number,
        "assignment_version": assignment_version,
        "message": (
            f"You scored {correct}/{total} ({score_percent:.1f}%). "
            f"Classified as: {classification}"
        ),
    }


@router.get("/results")
def get_results():
    results = list(
        results_collection.find({}, {"_id": 0}).sort("date_time", -1)
    )
    return {"results": results}


@router.get("/results/{student_email}")
def get_student_results(student_email: str):
    results = list(
        results_collection.find(
            {"student_email": student_email}, {"_id": 0}
        ).sort("date_time", -1)
    )
    return {"results": results}


@router.get("/check-attempt/{student_email}/{subject}")
def check_attempt(student_email: str, subject: str):
    """
    Returns the student's latest attempt info + retake eligibility.

    Logic:
    - Advanced     → can_retake=False always
    - Intermediate → can_retake=True if attempts_on_version < 2
    - Weak         → can_retake=True always
    - New assignment published → can_retake=True for everyone
    """
    latest = results_collection.find_one(
        {"student_email": student_email, "subject": subject},
        sort=[("date_time", -1)],
    )

    if not latest:
        return {
            "attempted": False,
            "can_retake": True,
            "retake_type": None,
            "classification": None,
            "attempt_count": 0,
            "attempts_remaining": 1,
        }

    classification = latest.get("classification")
    latest_version = latest.get("assignment_version", "v1")

    # Check if a newer assignment has been published
    published = assignments_collection.find_one({"subject": subject})
    published_version = published.get("assignment_version", "v1") if published else "v1"
    is_new_assignment = published_version != latest_version

    if is_new_assignment:
        return {
            "attempted": True,
            "can_retake": True,
            "retake_type": "new_assignment",
            "classification": classification,
            "score_percent": latest.get("score_percent"),
            "attempt_number": latest.get("attempt_number", 1),
            "attempt_count": 1,
            "attempts_remaining": 1,
        }

    if classification == "Advanced":
        return {
            "attempted": True,
            "can_retake": False,
            "retake_type": None,
            "classification": "Advanced",
            "score_percent": latest.get("score_percent"),
            "attempt_number": latest.get("attempt_number", 1),
            "attempt_count": results_collection.count_documents(
                {"student_email": student_email, "subject": subject}
            ),
            "attempts_remaining": 0,
        }

    if classification == "Intermediate":
        version_attempts = results_collection.count_documents({
            "student_email": student_email,
            "subject": subject,
            "assignment_version": latest_version,
        })
        remaining = max(0, MAX_INTERMEDIATE_ATTEMPTS - version_attempts)
        return {
            "attempted": True,
            "can_retake": remaining > 0,
            "retake_type": "intermediate" if remaining > 0 else None,
            "classification": "Intermediate",
            "score_percent": latest.get("score_percent"),
            "attempt_number": latest.get("attempt_number", 1),
            "attempt_count": version_attempts,
            "attempts_remaining": remaining,
        }

    # Weak
    return {
        "attempted": True,
        "can_retake": True,
        "retake_type": "weak",
        "classification": "Weak",
        "score_percent": latest.get("score_percent"),
        "attempt_number": latest.get("attempt_number", 1),
        "attempt_count": results_collection.count_documents(
            {"student_email": student_email, "subject": subject}
        ),
        "attempts_remaining": 99,  # unlimited for Weak
    }