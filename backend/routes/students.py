from fastapi import APIRouter, HTTPException
from models import StudentCreate
import store
from database.db import students_collection

router = APIRouter()
import hashlib




@router.post("/add-student")
def add_student(student: StudentCreate):

    
    existing = students_collection.find_one({"email": student.email})
    if existing:
        raise HTTPException(status_code=400, detail="Student exists")

    hashed_password = hashlib.sha256(student.password.encode()).hexdigest()
    
    students_collection.insert_one({
    "name": student.name,
    "email": student.email,
    "password": hashed_password
})

    return {"success": True}


@router.get("/students")
def get_students():
    students = list(students_collection.find({}, {"_id": 0}))
    return {"students": students}
