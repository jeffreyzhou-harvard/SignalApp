from app.config import settings
from app.models.job import JobStatus, JobPhase
from app.store import jobs, budget, personas
from app.ingest import clean, sampler
from app.enrich import persona_card
from app import pipeline


def run_job(session, job, xclient, grok_client=None):
    try:
        job.status = JobStatus.running

        # resolve
        job.phase = JobPhase.resolve
        seed = xclient.resolve_user(session, job.seed)
        job.seed_account_id = str(seed["id"])
        jobs.save(session, job); session.commit()

        engagers = {"likes": {}, "reposts": {}, "replies": {}, "last": {}}

        if job.relationship == "engager":
            # Engager-seeded ingest: the population IS the engagers of the seed's
            # recent posts (mega-account fix — newest followers are churn/bots;
            # likers/retweeters are the marketing-relevant audience). Engagement
            # fetch failure is fatal here, not degradable.
            job.phase = JobPhase.co_engage
            post_ids = xclient.api.get_recent_seed_posts(job.seed_account_id)
            engagers = xclient.fetch_engagers(session, post_ids, job.job_id)
            score = {uid: engagers["likes"].get(uid, 0) + 2 * engagers["reposts"].get(uid, 0)
                     for uid in set(engagers["likes"]) | set(engagers["reposts"])}
            ids = sorted(score, key=score.get, reverse=True)[: job.params.max_followers]
            job.phase = JobPhase.fetch_followers
            raw_pop = xclient.fetch_users_bulk(session, ids, job.job_id)
            tier1 = [pipeline.enrich_tier1(session, u, job.seed_account_id,
                                           relationship="engager") for u in raw_pop]
            job.progress.discovered = len(tier1)
            jobs.save(session, job); session.commit()
        else:
            # fetch followers -> tier 1
            job.phase = JobPhase.fetch_followers
            raw_followers = xclient.fetch_followers(session, job.seed_account_id,
                                                    job.params.max_followers, job.job_id)
            tier1 = [pipeline.enrich_tier1(session, u, job.seed_account_id) for u in raw_followers]
            job.progress.discovered = len(tier1)
            jobs.save(session, job); session.commit()

            # co-engagement (degradable): liking_users/retweeters need OAuth
            # user-context; an app-only bearer 403s here. Degrade to empty
            # engagers and continue — seed_engagement stays null, the rest of
            # the pipeline still runs.
            job.phase = JobPhase.co_engage
            try:
                post_ids = xclient.api.get_recent_seed_posts(job.seed_account_id)
                engagers = xclient.fetch_engagers(session, post_ids, job.job_id)
            except budget.BudgetExceeded:
                raise
            except Exception as e:
                print(f"[worker] co_engage degraded for job {job.job_id}: {e}")

        # reload tier1 docs with seed_engagement for sampling
        docs = [personas.get_persona(session, d.user_id) for d in tier1]
        for d in docs:
            d.seed_engagement = clean.aggregate_seed_engagement(d.user_id, engagers)

        # sample
        job.phase = JobPhase.sample
        job.member_ids = sampler.select_tier2(docs, job.params.sample_pct, min_n=min(100, len(docs)))
        job.progress.sampled = len(job.member_ids)
        jobs.save(session, job); session.commit()

        # enrich tier 2 — fetch serially (session-bound), then generate the
        # I/O-bound Grok cards concurrently, then write results serially.
        job.phase = JobPhase.enrich
        preps = []
        for uid in job.member_ids:
            try:
                prep = pipeline.enrich_tier2_fetch(session, uid, job.seed_account_id, xclient,
                                                   job.params.posts_per_user, engagers, job.job_id)
            except budget.BudgetExceeded:
                job.status = JobStatus.paused_budget
                job.error = "soft budget limit reached"
                jobs.save(session, job); session.commit()
                return job
            except Exception as e:
                job.progress.failed += 1
                job.error = str(e)
                jobs.save(session, job); session.commit()
                continue
            if prep is None:
                job.progress.enriched += 1      # idempotent skip
                jobs.save(session, job); session.commit()
            else:
                preps.append(prep)

        cards = persona_card.generate_cards_concurrent(
            [(p.bio, p.content) for p in preps],
            client=grok_client, concurrency=settings.enrich_concurrency,
        )
        for prep, card in zip(preps, cards):
            pipeline.enrich_tier2_write(session, prep, card)
            job.progress.enriched += 1
            jobs.save(session, job); session.commit()

        job.phase = JobPhase.done
        job.status = JobStatus.done
        jobs.save(session, job); session.commit()
        return job

    except budget.BudgetExceeded:
        job.status = JobStatus.paused_budget
        jobs.save(session, job); session.commit()
        return job
    except Exception as e:
        job.status = JobStatus.failed
        job.error = str(e)
        jobs.save(session, job); session.commit()
        return job
