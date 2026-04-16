from fastapi import APIRouter, HTTPException
from models import LabPostRequest
import store
from database.db import students_collection, labs_collection, results_collection

router = APIRouter()


@router.post("/post-lab")
def post_lab(req: LabPostRequest):

    labs_collection.update_one(
        {"subject": req.subject},
        {
            "$set": {
                "subject": req.subject,
                "title": req.title,
                "description": req.description,
                "tasks": req.tasks
            }
        },
        upsert=True
    )

    return {"success": True}

@router.get("/lab/{subject}")
def get_lab(subject: str, student_email: str = None):

    if student_email:
        student = students_collection.find_one({"email": student_email})
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        latest = results_collection.find_one(
            {"student_email": student_email, "subject": subject},
            sort=[("date_time", -1)]
        )

        if latest is None:
            raise HTTPException(
                status_code=403,
                detail="No test result found. Please complete the test first."
            )

        if latest.get("classification") == "Weak":
            raise HTTPException(
                status_code=403,
                detail="Access denied. Improve score to unlock labs."
            )

    lab = labs_collection.find_one({"subject": subject})

    if not lab:
        raise HTTPException(status_code=404, detail="No lab found")

    # ✅ FIX: Remove MongoDB _id
    lab["_id"] = str(lab["_id"])

    return lab
