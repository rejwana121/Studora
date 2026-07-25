from fastapi import APIRouter

from app.api.v1.profile import router as profile_router
from app.api.v1.subject import router as subject_router

router = APIRouter()
router.include_router(profile_router)
router.include_router(subject_router)
