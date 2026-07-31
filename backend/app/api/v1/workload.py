from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_session
from app.schemas.workload_api import WorkloadCurrentResponse
from app.services.workload.evaluation import get_current_workload_evaluation

router = APIRouter(prefix="/workload", tags=["workload"])


@router.get("/current", response_model=WorkloadCurrentResponse)
def read_current_workload(
    current_user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> WorkloadCurrentResponse:
    return get_current_workload_evaluation(session, current_user.id)
