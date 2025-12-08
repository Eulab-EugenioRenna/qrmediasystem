from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
import uuid

# Models

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    hashed_password: str
    is_admin: bool = Field(default=False)

class Recipient(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: Optional[str] = None
    notes: Optional[str] = None

    assignments: List["Assignment"] = Relationship(back_populates="recipient", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class MediaItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    media_type: str # 'audio', 'video'
    filename: str
    cover_filename: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Simple many-to-many with albums could be done, but for simplicity let's do:
    # A media item belongs to one album? Or multiple?
    # Requirement: "Album generates a link".
    # Let's say MediaItem can belong to multiple Albums via Link table
    album_links: List["AlbumMediaLink"] = Relationship(back_populates="media_item", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class Album(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: Optional[str] = None
    cover_filename: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    media_links: List["AlbumMediaLink"] = Relationship(back_populates="album", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    assignments: List["Assignment"] = Relationship(back_populates="album", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class AlbumMediaLink(SQLModel, table=True):
    album_id: Optional[int] = Field(default=None, foreign_key="album.id", primary_key=True)
    media_item_id: Optional[int] = Field(default=None, foreign_key="mediaitem.id", primary_key=True)

    album: Album = Relationship(back_populates="media_links")
    media_item: MediaItem = Relationship(back_populates="album_links")

class Assignment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    recipient_id: int = Field(foreign_key="recipient.id")
    album_id: int = Field(foreign_key="album.id")
    token: str = Field(default_factory=lambda: str(uuid.uuid4()), unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


    recipient: "Recipient" = Relationship(back_populates="assignments")
    album: "Album" = Relationship(back_populates="assignments")
    
    sessions: List["AssignmentSession"] = Relationship(back_populates="assignment", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    events: List["StatisticEvent"] = Relationship(back_populates="assignment", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class AlbumRead(SQLModel):
    id: int
    title: str
    description: Optional[str]
    cover_filename: Optional[str] = None
    created_at: datetime
    media_items: List[MediaItem] = []

class AssignmentSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="assignment.id", index=True)
    token: str = Field(unique=True, index=True) # Session token
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    
    assignment: Optional[Assignment] = Relationship(back_populates="sessions")
    
class StatisticEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="assignment.id", index=True)
    event_type: str # 'view', 'play', 'click'
    media_item_id: Optional[int] = Field(default=None, foreign_key="mediaitem.id")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    details: Optional[str] = None # JSON string or text for extra info
    
    assignment: Optional[Assignment] = Relationship(back_populates="events")


