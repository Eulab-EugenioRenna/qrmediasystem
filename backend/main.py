from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="QR Media Admin", root_path="/api")

# Mount media directory
app.mount("/media", StaticFiles(directory="media"), name="media")

from database import create_db_and_tables, get_session
from sqlmodel import Session
from auth import create_initial_admin
from routers import auth, admin, public

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(public.router)


@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    with Session(next(get_session()).bind) as session: # Hacky way to get session but works for startup
         create_initial_admin(session)


@app.get("/")
def read_root():
    return {"message": "Welcome to QR Media API"}
