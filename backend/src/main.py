"""Public FastAPI entry point for Project Big Tester platform components.

This publication deliberately excludes account adapters, strategy modules, execution
wiring, and production secrets. It exposes only a local health endpoint so the
public platform boundary can be reviewed without enabling financial operations.
"""
from fastapi import FastAPI

app = FastAPI(
    title="Project Big Tester Public Source Edition",
    description="Sanitized platform architecture and safety components.",
    version="1.0.0-public",
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "mode": "public-source-edition"}