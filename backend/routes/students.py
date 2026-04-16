from fastapi import APIRouter, HTTPException
from models import StudentCreate
from database.db import students_collection, results_collection, assignments_collection
import hashlib

router = APIRouter()


@router.post("/add-student")
def add_student(student: StudentCreate):
    existing = students_collection.find_one({"email": student.email})
    if existing:
        raise HTTPException(status_code=400, detail="Student already exists")

    hashed_password = hashlib.sha256(student.password.encode()).hexdigest()

    students_collection.insert_one({
        "name": student.name,
        "email": student.email,
        "password": hashed_password
    })

    return {"success": True}


@router.get("/students")
def get_students():
    students = list(students_collection.find({}, {"_id": 0, "password": 0}))
    return {"students": students}


@router.delete("/remove-student/{email}")
def remove_student(email: str):
    """
    Permanently removes a student and all their associated data:
    - Student record
    - All test results
    - All personalised assignments (keyed as subject__email)
    """
    student = students_collection.find_one({"email": email})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # 1. Remove student record
    students_collection.delete_one({"email": email})

    # 2. Remove all results for this student
    results_deleted = results_collection.delete_many({"student_email": email})

    # 3. Remove all personalised assignments (keys contain the email)
    # Personalised assignments are stored as "subject__studentemail"
    assignments_deleted = assignments_collection.delete_many(
        {"subject": {"$regex": f"__{email}$"}}
    )

    return {
        "success": True,
        "email": email,
        "results_removed": results_deleted.deleted_count,
        "personal_assignments_removed": assignments_deleted.deleted_count,
    }