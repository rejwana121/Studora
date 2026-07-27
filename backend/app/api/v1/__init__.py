from fastapi import APIRouter

from app.api.v1.planner import router as planner_router
from app.api.v1.profile import router as profile_router
from app.api.v1.study_block import router as study_block_router
from app.api.v1.subject import router as subject_router
from app.api.v1.subtask import router as subtask_router
from app.api.v1.task import router as task_router

router = APIRouter()
router.include_router(profile_router)
router.include_router(subject_router)
router.include_router(task_router)
router.include_router(subtask_router)
router.include_router(planner_router)
router.include_router(study_block_router)
