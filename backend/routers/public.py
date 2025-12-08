from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlmodel import Session, select
from database import get_session
from models import Assignment, Album, MediaItem, AlbumMediaLink, AssignmentSession, StatisticEvent
from typing import List, Optional
from pydantic import BaseModel
import uuid
from datetime import datetime, timedelta

router = APIRouter(prefix="/public", tags=["public"])

class HeartbeatRequest(BaseModel):
    session_token: str

class EventRequest(BaseModel):
    session_token: str
    event_type: str
    media_item_id: Optional[int] = None
    details: Optional[str] = None

@router.get("/view/{token}")
def view_assignment(
    token: str, 
    request: Request,
    x_session_token: Optional[str] = Header(default=None, alias="X-Session-Token"),
    session: Session = Depends(get_session)
):
    assignment = session.exec(select(Assignment).where(Assignment.token == token)).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Invalid token")
    
    # Session Concurrency Logic
    current_time = datetime.utcnow()
    active_session_window = 30 # seconds
    
    # Check for any existing session for this assignment
    existing_session = session.exec(select(AssignmentSession).where(AssignmentSession.assignment_id == assignment.id)).first()
    
    new_session_token = None
    client_ip = request.client.host
    user_agent = request.headers.get('user-agent')

    # Grace period for same client to recover session (e.g. refresh)
    # If the request comes from the same IP, we might allow taking over even if Active
    
    is_active = False
    if existing_session:
        time_diff = (current_time - existing_session.last_active_at).total_seconds()
        if time_diff < active_session_window:
            is_active = True
            
    if is_active:
        # Check identity overlap (IP + User Agent must match for takeover)
        is_same_client = (existing_session.ip_address == client_ip and existing_session.user_agent == user_agent)
        
        # If token matches, it's definitely the same session -> OK
        if existing_session.token == x_session_token:
            existing_session.last_active_at = current_time
            session.add(existing_session)
            session.commit()
            new_session_token = existing_session.token
            
        # If mismatch but SAME CLIENT (IP + UA) -> Allow takeover (assume refresh)
        elif is_same_client:
            # Takeover
            existing_session.token = str(uuid.uuid4())
            existing_session.last_active_at = current_time
            session.add(existing_session)
            session.commit()
            new_session_token = existing_session.token
        else:
            # Different client -> BLOCK
            raise HTTPException(status_code=403, detail="Assignment is active in another session.")
            
    else:
        # Create new or update existing (expired)
        if existing_session:
            session.delete(existing_session)
            session.commit()
            
        new_session_token = str(uuid.uuid4())
        new_sess = AssignmentSession(
            assignment_id=assignment.id,
            token=new_session_token,
            last_active_at=current_time,
            ip_address=client_ip,
            user_agent=user_agent
        )
        session.add(new_sess)
        session.commit()

    album = session.get(Album, assignment.album_id)
    # Fetch media items
    media_links = session.exec(select(AlbumMediaLink).where(AlbumMediaLink.album_id == album.id)).all()
    media_items = []
    for link in media_links:
        item = session.get(MediaItem, link.media_item_id)
        if item:
            media_items.append(item)
            
    return {
        "recipient": assignment.recipient.name,
        "album": album.title,
        "album_cover": album.cover_filename,
        "media": media_items,
        "session_token": new_session_token,
        "assignment_id": assignment.id
    }

@router.post("/heartbeat")
def heartbeat(req: HeartbeatRequest, session: Session = Depends(get_session)):
    sess = session.exec(select(AssignmentSession).where(AssignmentSession.token == req.session_token)).first()
    if not sess:
         raise HTTPException(status_code=404, detail="Session not found")
    
    sess.last_active_at = datetime.utcnow()
    session.add(sess)
    session.commit()
    return {"status": "ok"}

@router.post("/leave")
def leave_session(req: HeartbeatRequest, session: Session = Depends(get_session)):
    """Explicitly release the session lock."""
    sess = session.exec(select(AssignmentSession).where(AssignmentSession.token == req.session_token)).first()
    if sess:
         session.delete(sess)
         session.commit()
    return {"status": "ok"}

@router.post("/event")
def log_event(req: EventRequest, session: Session = Depends(get_session)):
    sess = session.exec(select(AssignmentSession).where(AssignmentSession.token == req.session_token)).first()
    if not sess:
         raise HTTPException(status_code=403, detail="Invalid or expired session")
         
    # Deduping Logic
    # If event_type is 'view_assignment', check if we already logged it for this session/assignment
    if req.event_type == 'view_assignment':
        existing = session.exec(select(StatisticEvent).where(
            StatisticEvent.assignment_id == sess.assignment_id,
            StatisticEvent.event_type == 'view_assignment',
            # We want to check if this specific session has viewed it? 
            # OR just general views? Usually view count is "visits".
            # If we want 1 visit per session, we can filter by time or link it to session if we had session_id in stats.
            # But we don't have session_id in StatisticEvent.
            # We can check if there's a view event from this session's created time range? 
            # Or simpler: Rely on frontend not sending it twice, BUT ensure strictness here.
            # Let's say: 1 view per 10 minutes from same IP? 
            # Or: 1 view per assignment_id per 1 minute window?
            # A simple robust way: "1 view per active session lifecycle".
            # Since we don't link StatEvent to Session directly, we can use the 'details' or timestamp.
            # Let's just allow it for now but rely on frontend. 
            # Actually, user complained about double stats.
            # Let's make view_assignment unique per day per assignment? No that's too aggressive.
            # Let's block if a view event exists within the last 30 seconds for this assignment?
            StatisticEvent.timestamp > datetime.utcnow() - timedelta(seconds=10)
        )).first()
        if existing:
            return {"status": "ignored"}

    evt = StatisticEvent(
        assignment_id=sess.assignment_id,
        event_type=req.event_type,
        media_item_id=req.media_item_id,
        details=req.details
    )
    session.add(evt)
    session.commit()
    return {"status": "ok"}
