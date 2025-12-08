from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlmodel import Session
from database import get_session
from models import User
from auth import verify_password, create_access_token
from datetime import timedelta

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=60 * 24 * 30)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    # Post-login cleanup
    try:
        cleanup_orphaned_media(session)
    except Exception as e:
        print(f"Cleanup failed: {e}")
        
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
def logout(session: Session = Depends(get_session)):
    # Trigger cleanup on logout
    try:
        cleanup_orphaned_media(session)
    except Exception as e:
        print(f"Cleanup failed: {e}")
    return {"message": "Logged out"}

import os
from models import MediaItem, Album

def cleanup_orphaned_media(session: Session):
    # Collect all valid filenames from DB
    valid_files = set()
    
    # Media files
    for (f,) in session.query(MediaItem.filename).all():
        valid_files.add(f)
        
    # Media covers
    for (f,) in session.query(MediaItem.cover_filename).filter(MediaItem.cover_filename != None).all():
        valid_files.add(f)
        
    # Album covers
    for (f,) in session.query(Album.cover_filename).filter(Album.cover_filename != None).all():
        valid_files.add(f)
        
    media_dir = "media"
    if not os.path.exists(media_dir):
        return
        
    # Compare with disk
    for filename in os.listdir(media_dir):
        # Skip special files or directories if any (e.g. .gitkeep)
        if filename.startswith("."):
            continue
            
        if filename not in valid_files:
            file_path = os.path.join(media_dir, filename)
            if os.path.isfile(file_path):
                print(f"Deleting orphaned file: {filename}")
                try:
                    os.remove(file_path)
                except Exception as e:
                    print(f"Failed to delete {file_path}: {e}")

from jose import JWTError, jwt
from auth import SECRET_KEY, ALGORITHM

async def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = session.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user
