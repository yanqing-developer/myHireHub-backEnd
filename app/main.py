# app/main.py
from fastapi import FastAPI
from app.api.v1.endpoints.health import router as health_router

app = FastAPI()


@app.get("/", tags=["root"])
async def root():
    return {"message": "SnapChef backend is running"}



app.include_router(health_router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
