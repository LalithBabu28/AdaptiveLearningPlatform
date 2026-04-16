from pydantic import BaseModel
from typing import List, Optional

class LoginRequest(BaseModel):
    email: str
    password: str
    role: str  # "teacher" or "student"

class StudentCreate(BaseModel):
    name: str
    email: str
    password: str

class MCQOption(BaseModel):
    a: str
    b: str
    c: str
    d: str

class MCQQuestion(BaseModel):
    id: str
    question: str
    options: MCQOption
    correct_answer: str
    topic: str

class GenerateMCQRequest(BaseModel):
    subject: str
    topic: str

class PublishAssignmentRequest(BaseModel):
    subject: str
    questions: List[MCQQuestion]
    title: str

class SubmitTestRequest(BaseModel):
    student_email: str
    subject: str
    answers: dict  # {question_id: selected_option}

class LabPostRequest(BaseModel):
    subject: str
    title: str
    description: str
    tasks: List[str]

class ChatRequest(BaseModel):
    message: str
    subject: Optional[str] = None
    conversation_history: Optional[List[dict]] = []
