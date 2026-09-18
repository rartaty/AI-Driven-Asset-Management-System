# Project Big Tester

Project Big Tester is a personal asset-management and automated-operations platform. It combines a Next.js dashboard, a FastAPI service boundary, time-series data storage, scheduled processing, AI-assisted analysis, and safety controls for local operation.

This repository is the **sanitized public source edition** of the system. It publishes the real user interface, platform contracts, configuration patterns, data models, security primitives, and infrastructure shape. It is not a mock product or a generated demo.

## Publication Boundary

The source is intentionally not sufficient to connect to a broker, a bank, or a live account. The following private materials have been removed:

- Credentials, account identifiers, personal data, local configuration, logs, backups, and real market or portfolio data.
- Broker and bank adapters, live-order execution, account synchronization, and production notification configuration.
- Strategy implementations, signals, ranking and selection rules, thresholds, allocation formulas, prompts, optimizers, backtests, and research results.
- Internal runbooks, incident records, task histories, and environment-specific operational documents.

The remaining code demonstrates the platform's engineering structure without exposing the investment decision logic or creating a route to execute trades.

## Core Capabilities

- Portfolio, history, analytics, monitoring, reports, and timeline views implemented with Next.js, React, and TypeScript.
- FastAPI-oriented service boundary with configuration, authentication, rate-limiting, structured logging, and health-oriented design.
- SQLAlchemy data models for portfolio state, auditability, system status, and time-series persistence.
- A fail-safe kill-switch implementation that blocks new execution paths while preserving the ability to close existing positions.
- Podman/Docker-oriented PostgreSQL and TimescaleDB infrastructure patterns with localhost-only service exposure.
- Separation of AI-assisted analysis from the execution path, and parameter-store based secret-management patterns.

## Architecture

```text
Next.js dashboard
       |
       v
FastAPI service boundary
       |
       +-- configuration, authorization, rate limits, structured logging
       +-- safety controls and audit-oriented models
       |
       v
PostgreSQL / TimescaleDB

Private modules excluded from this edition:
market adapters, account adapters, strategy engine, execution engine,
backtests, optimization, prompts, production secrets, operational data
```

## Technology Stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, CSS Modules, Recharts |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic |
| Database | SQLite for local development; PostgreSQL and TimescaleDB for time-series workloads |
| Scheduling | APScheduler design for time-based platform jobs |
| AI | Provider-agnostic analysis and reporting integration pattern |
| Security | AWS Systems Manager Parameter Store, KMS, server-side authorization, rate limiting |
| Infrastructure | Windows, Podman, docker-compose, localhost-only container ports |

## Repository Structure

```text
.
├── frontend/                 # Actual dashboard source and API proxy boundary
├── backend/
│   ├── src/core/             # Configuration, logging, authorization, rate limits, safety controls
│   ├── src/models/           # SQLAlchemy persistence and API schemas
│   └── requirements.txt      # Backend dependency definition
├── docker/postgres/          # Database initialization
├── docs/                     # Public architecture and safety documentation
└── docker-compose.yml        # Sanitized local infrastructure definition
```

## Safety Design

- **Fail-safe first**: the kill switch is designed to suppress new execution when a safety condition is active. Re-enabling is a deliberate, auditable action.
- **Secret separation**: credentials are supplied at runtime through a secret-management boundary and are never committed to source control.
- **Least exposure**: infrastructure services bind only to localhost by default; the public source has no live account adapter or order execution module.
- **AI isolation**: AI supports analysis and reporting. It is not the only control point for an execution decision.
- **Auditability**: structured logs and persistence models are designed to retain operational state and safety events without committing personal data to the repository.

## Local Review

The frontend can be inspected and built independently:

```powershell
cd frontend
npm ci
npm run lint
npm run build
```

The backend files in this public edition are architectural and safety components. Production adapters, strategy modules, runtime secrets, and execution wiring are intentionally absent, so this repository must not be used to connect to financial accounts or place orders.

## Disclaimer

This repository is a technical publication. It is not investment advice, an offer of investment services, or software for executing financial transactions.