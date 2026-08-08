from fastapi import FastAPI

app = FastAPI(title="AgentSim Ingestion")


@app.get("/health")
def health():
    return {"status": "ok"}
