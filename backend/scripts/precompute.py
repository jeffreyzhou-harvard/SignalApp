"""Pre-ingest demo accounts before demo day. Usage: uv run python scripts/precompute.py @handle"""
import sys
from app.store import db, jobs
from app.models.job import IngestRequest
from app.ingest.x_client import XClient
from app.ingest.tweepy_adapter import make_api, make_grok
from app import worker

def main(seed: str):
    db.init_db()
    with db.SessionLocal() as s:
        job = jobs.create_job(s, IngestRequest(seed=seed)); s.commit()
        worker.run_job(s, jobs.get_job(s, job.job_id), XClient(api=make_api()), grok_client=make_grok())
        print("done:", job.job_id)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "@xai")
