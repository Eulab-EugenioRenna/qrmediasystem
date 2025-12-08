from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlmodel import Session, select
from typing import List, Optional
from database import get_session
from models import User, Recipient, MediaItem, Album, Assignment, AlbumMediaLink, AlbumRead
from routers.auth import get_current_admin
from pydantic import BaseModel
import shutil
import os
import uuid
import qrcode
import io
import base64

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])

MEDIA_DIR = "media"

# Recipient CRUD
@router.post("/recipients", response_model=Recipient)
def create_recipient(recipient: Recipient, session: Session = Depends(get_session)):
    session.add(recipient)
    session.commit()
    session.refresh(recipient)
    return recipient

@router.get("/recipients", response_model=List[Recipient])
def read_recipients(session: Session = Depends(get_session)):
    return session.exec(select(Recipient)).all()

import aiofiles

# Media Upload
@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    title: str = Form(...),
    media_type: str = Form(...), # audio/video
    session: Session = Depends(get_session)
):
    # Verify file extension/type?
    file_ext = file.filename.split(".")[-1]
    new_filename = f"{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(MEDIA_DIR, new_filename)
    
    # Async stream write to disk
    async with aiofiles.open(file_path, 'wb') as out_file:
        while content := await file.read(1024 * 1024):  # 1MB chunks
            await out_file.write(content)
        
    media_item = MediaItem(title=title, media_type=media_type, filename=new_filename)
    session.add(media_item)
    session.commit()
    session.refresh(media_item)
    return media_item

@router.get("/media", response_model=List[MediaItem])
def get_media(session: Session = Depends(get_session)):
    return session.exec(select(MediaItem)).all()

# Cover Upload
@router.post("/upload/cover")
async def upload_cover(
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    # Verify file extension?
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
        
    file_ext = file.filename.split(".")[-1]
    new_filename = f"cover_{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(MEDIA_DIR, new_filename)
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        while content := await file.read(1024 * 1024):
            await out_file.write(content)
            
    return {"filename": new_filename}

class CoverUpdate(BaseModel):
    filename: str

@router.post("/albums/{album_id}/cover")
def set_album_cover(album_id: int, cover: CoverUpdate, session: Session = Depends(get_session)):
    album = session.get(Album, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    album.cover_filename = cover.filename
    session.add(album)
    session.commit()
    return {"message": "Cover set"}

@router.post("/media/{media_id}/cover")
def set_media_cover(media_id: int, cover: CoverUpdate, session: Session = Depends(get_session)):
    media = session.get(MediaItem, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    media.cover_filename = cover.filename
    session.add(media)
    session.commit()
    return {"message": "Cover set"}

# Album CRUD
@router.post("/albums", response_model=Album)
def create_album(album: Album, session: Session = Depends(get_session)):
    session.add(album)
    session.commit()
    session.refresh(album)
    return album

@router.post("/albums/{album_id}/add_media/{media_id}")
def add_media_to_album(album_id: int, media_id: int, session: Session = Depends(get_session)):
    album = session.get(Album, album_id)
    media = session.get(MediaItem, media_id)
    if not album or not media:
        raise HTTPException(status_code=404, detail="Album or Media not found")
    
    link = AlbumMediaLink(album_id=album_id, media_item_id=media_id)
    session.add(link)
    session.commit()
    return {"message": "Media added to album"}

@router.get("/albums", response_model=List[AlbumRead])
def get_albums(session: Session = Depends(get_session)):
    albums = session.exec(select(Album)).all()
    results = []
    for album in albums:
        # Load relationships manually if not eager loaded (lazy loading works in sync context usually, but better to be explicit or let loop handle it)
        # Note: SQLModel Relationship defaults to lazy. Accessing album.media_links triggers query.
        items = [link.media_item for link in album.media_links]
        results.append(AlbumRead(
            id=album.id, 
            title=album.title, 
            description=album.description, 
            cover_filename=album.cover_filename,
            created_at=album.created_at,
            media_items=items
        ))
    return results


# Assignment & QR
@router.post("/assign")
def assign_album(recipient_id: int, album_id: int, session: Session = Depends(get_session)):
    # Check if assignment exists? Maybe allow multiple.
    assignment = Assignment(recipient_id=recipient_id, album_id=album_id)
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    
    # Generate QR Code
    # The URL will be configured in frontend logic usually, but here we can return the relative path
    # Front end url: https://<domain>/view/<token>
    
    return assignment

@router.get("/assignments")
def get_assignments(session: Session = Depends(get_session)):
    return session.exec(select(Assignment)).all()

@router.get("/qrcode/{token}")
def generate_qr(token: str):
    # This endpoint generates a QR code image for the given token
    # Assuming the frontend URL logic.
    # In a real app, hostname needs to be configurable.
    # For now we might just return the Base64 of the QR or the PNG.
    # Let's say we assume the host is the caller's origin, handled by frontend? 
    # Or we construct it here.
    # Let's construct a placeholder URL.
    
    url = f"/view/{token}" 
    # Note: Client will prepend host. 
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    img_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    
    return {"qr_base64": img_str, "url": url}

# Delete Operations

@router.delete("/recipients/{recipient_id}")
def delete_recipient(recipient_id: int, session: Session = Depends(get_session)):
    recipient = session.get(Recipient, recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    session.delete(recipient)
    session.commit()
    return {"message": "Recipient deleted"}

@router.delete("/media/{media_id}")
def delete_media(media_id: int, session: Session = Depends(get_session)):
    media = session.get(MediaItem, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    # Delete file from disk
    file_path = os.path.join(MEDIA_DIR, media.filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        
    session.delete(media)
    session.commit()
    return {"message": "Media deleted"}

@router.delete("/albums/{album_id}")
def delete_album(album_id: int, session: Session = Depends(get_session)):
    album = session.get(Album, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    session.delete(album)
    session.commit()
    return {"message": "Album deleted"}

@router.delete("/albums/{album_id}/media/{media_id}")
def remove_media_from_album(album_id: int, media_id: int, session: Session = Depends(get_session)):
    link = session.get(AlbumMediaLink, (album_id, media_id))
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    session.delete(link)
    session.commit()
    return {"message": "Media removed from album"}

@router.delete("/assignments/{assignment_id}")
def delete_assignment(assignment_id: int, session: Session = Depends(get_session)):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    session.delete(assignment)
    session.commit()
    return {"message": "Assignment deleted"}

# Statistics
from models import StatisticEvent, AssignmentSession
from sqlalchemy import func

@router.get("/assignments/{assignment_id}/stats")
def get_assignment_stats(assignment_id: int, session: Session = Depends(get_session)):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Aggregate stats
    total_views = session.exec(select(func.count(StatisticEvent.id)).where(StatisticEvent.assignment_id == assignment_id, StatisticEvent.event_type == 'view_assignment')).one()
    total_plays = session.exec(select(func.count(StatisticEvent.id)).where(StatisticEvent.assignment_id == assignment_id, StatisticEvent.event_type == 'media_play')).one()
    
    # Last active session
    last_session = session.exec(select(AssignmentSession).where(AssignmentSession.assignment_id == assignment_id).order_by(AssignmentSession.last_active_at.desc())).first()
    
    # Per media stats
    # We want count of plays per media_item_id
    media_stats = session.exec(
        select(StatisticEvent.media_item_id, func.count(StatisticEvent.id))
        .where(StatisticEvent.assignment_id == assignment_id, StatisticEvent.event_type == 'media_play')
        .group_by(StatisticEvent.media_item_id)
    ).all()
    
    media_play_counts = {m_id: count for m_id, count in media_stats if m_id is not None}

    return {
        "assignment_id": assignment_id,
        "total_views": total_views,
        "total_plays": total_plays,
        "last_active": last_session.last_active_at if last_session else None,
        "media_stats": media_play_counts
    }
