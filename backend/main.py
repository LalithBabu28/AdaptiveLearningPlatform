from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, students, assignments, tests, labs, chat, analysis

app = FastAPI(title="Adaptive Learning Platform", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,        prefix="/api", tags=["auth"])
app.include_router(students.router,    prefix="/api", tags=["students"])
app.include_router(assignments.router, prefix="/api", tags=["assignments"])
app.include_router(tests.router,       prefix="/api", tags=["tests"])
app.include_router(labs.router,        prefix="/api", tags=["labs"])
app.include_router(chat.router,        prefix="/api", tags=["chat"])
app.include_router(analysis.router,    prefix="/api", tags=["analysis"])


@app.get("/")
def root():
    return {"message": "Adaptive Learning Platform API v2"}
