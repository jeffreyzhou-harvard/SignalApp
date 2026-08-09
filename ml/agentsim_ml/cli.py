"""CLI. Examples:

  uv run agentsim-run --synthetic                        # E0 sanity on fixtures
  uv run agentsim-run --synthetic --arm C --sparse 0.3   # composition + fusion
  uv run agentsim-run --data ingest.json --algo umap_hdbscan --embedder gemini
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from .config import RunConfig
from .fixtures import make_fixtures
from .pipeline import run
from .schema import PersonaDocument


def main() -> None:
    p = argparse.ArgumentParser(description="AgentSim layer-B experiment runner")
    p.add_argument("--synthetic", action="store_true", help="use fixture data")
    p.add_argument("--n", type=int, default=150, help="fixture count")
    p.add_argument("--data", type=Path, help="ingest JSON (list of PersonaDocuments)")
    p.add_argument("--from-db", metavar="SEED_ID", help="load personas for seed account from Neon")
    p.add_argument("--write-db", action="store_true", help="write run to Neon and activate it")
    p.add_argument("--env", default="../.env", help="path to .env with DATABASE_URL")
    p.add_argument("--arm", default="T", choices=list("ABCDEF") + ["T"],
                   help="composition arm (F = +engaged targets, T = taxonomy backbone)")
    p.add_argument("--embedder", default="local", choices=["local", "gemini", "xai"])
    p.add_argument("--sparse", type=float, default=0.0, dest="sparse_weight")
    p.add_argument("--algo", default="kmeans",
                   choices=["kmeans", "umap_hdbscan", "agglomerative"])
    p.add_argument("--k", type=int, default=8, help="n_clusters for kmeans/agglo")
    p.add_argument("--labeler", default="grok", choices=["heuristic", "grok"])
    p.add_argument("--min-export", type=int, default=None,
                   help="min exportable cluster size (default: 10 synthetic, 12 real)")
    p.add_argument("--run-id", default=None)
    p.add_argument("--tags-file", default=None, help="reuse prior tags.json (arm T)")
    p.add_argument("--role-weight", type=float, default=0.5)
    p.add_argument("--strip-pc1", action="store_true")
    p.add_argument("--tax-dense-arm", default="A", choices=["A", "C", "F"])
    p.add_argument("--tax-weights", default=None, help="taxonomy,bio,sparse e.g. 0.6,0.25,0.15")
    p.add_argument("--min-cluster-frac", type=float, default=None, help="HDBSCAN min cluster size as frac of sample")
    p.add_argument("--umap-neighbors", type=int, default=None)
    p.add_argument("--hierarchical", action="store_true", help="subdomain pass on dominant tags")
    args = p.parse_args()

    if args.synthetic:
        docs = make_fixtures(args.n)
        min_export = args.min_export if args.min_export is not None else 10
    elif args.data:
        raw = json.loads(args.data.read_text())
        docs = [PersonaDocument.from_ingest(r) for r in raw]
        min_export = args.min_export if args.min_export is not None else 12
    elif args.from_db:
        from .db import fetch_personas, get_engine

        raw = fetch_personas(get_engine(args.env), args.from_db)
        docs = [PersonaDocument.from_ingest(r) for r in raw]
        min_export = args.min_export if args.min_export is not None else 12
    else:
        p.error("need --synthetic, --data, or --from-db")

    cfg = RunConfig(
        run_id=args.run_id or f"{args.arm}-{args.algo}-s{args.sparse_weight}-{int(time.time())}",
        composition=args.arm, embedder=args.embedder,
        sparse_weight=args.sparse_weight, algorithm=args.algo,
        n_clusters=args.k, labeler=args.labeler, min_export_size=min_export,
        tags_file=args.tags_file, role_weight=args.role_weight,
        tax_dense_arm=args.tax_dense_arm, hierarchical=args.hierarchical,
        **({"tax_weights": tuple(float(x) for x in args.tax_weights.split(","))} if args.tax_weights else {}),
        **({"hdbscan_min_cluster_frac": args.min_cluster_frac} if args.min_cluster_frac else {}),
        **({"umap_neighbors": args.umap_neighbors} if args.umap_neighbors else {}),
        strip_common_component=args.strip_pc1,
    )
    res = run(cfg, docs)
    print(f"run {cfg.run_id}: {res.scores.to_row()}")
    print(f"clusters: {[(cl.cluster_id, cl.name) for cl in res.cluster_labels]}")
    print(f"report: {res.report_path}")

    if args.write_db:
        from .db import get_engine, write_run

        seed = res.deep_docs[0].seed_account_id if res.deep_docs else (args.from_db or "")
        engine = get_engine(args.env)
        write_run(engine, cfg, res.aggregates, res.members, res.scores,
                  seed_account_id=seed, activate=True)
        print(f"wrote + activated run {cfg.run_id} in DB (seed {seed})")

        # Backfill personas.vector — only from the space the backend queries in
        # (gemini-embedding-001 / 1536 / CLUSTERING); local TF-IDF vectors would
        # silently poison pgvector search.
        if cfg.embedder == "gemini" and res.dense is not None:
            from .db import write_vectors

            n = write_vectors(engine, [d.user_id for d in res.deep_docs],
                              res.dense, model="gemini-embedding-001",
                              dim=res.dense.shape[1], embedding_version=cfg.run_id)
            print(f"backfilled {n} persona vectors")
        elif args.write_db and cfg.embedder != "gemini":
            print("skipped vector backfill (embedder is not gemini — space mismatch)")


if __name__ == "__main__":
    main()
