from fastapi import APIRouter, HTTPException
from models import LoginRequest
import store
from database.db import students_collection
import hashlib
router = APIRouter()

TEACHER_CREDENTIALS = {"email": "admin@school.com", "password": "admin123"}

@router.post("/login")
def login(req: LoginRequest):

    if req.role == "teacher":
        if req.email == TEACHER_CREDENTIALS["email"] and req.password == TEACHER_CREDENTIALS["password"]:
            return {
                "success": True,
                "role": "teacher",
                "name": "Admin Teacher",
                "email": req.email,
                "token": "teacher-token-hardcoded"
            }
        raise HTTPException(status_code=401, detail="Invalid teacher credentials")

    elif req.role == "student":
        student = students_collection.find_one({"email": req.email})

        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        hashed_input = hashlib.sha256(req.password.encode()).hexdigest()

        # DEBUG (temporarily add this)
        print("Entered:", req.password)
        print("Hashed Input:", hashed_input)
        print("Stored Password:", student["password"])

        if student["password"] != hashed_input and student["password"] != req.password:
            raise HTTPException(status_code=401, detail="Invalid password")
        return {
            "success": True,
            "role": "student",
            "name": student["name"],
            "email": student["email"],
            "token": f"student-token-{req.email}"
        }

    else:
        raise HTTPException(status_code=400, detail="Invalid role")
