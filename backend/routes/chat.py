from fastapi import APIRouter
from models import ChatRequest
from services.grok_service import get_tutor_response

router = APIRouter()

@router.post("/chat")
async def chat(req: ChatRequest):
    response = await get_tutor_response(
        message=req.message,
        subject=req.subject or "General",
        history=req.conversation_history or []
    )
    return {"response": response}
