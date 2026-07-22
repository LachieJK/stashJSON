# StashJSON

**Store, version, and organize JSON — without standing up your own database.**

StashJSON is a hosted home for your JSON documents. Save any JSON, get it back later over a simple REST API, group related documents into workspaces, and let StashJSON keep a full history of every change automatically. Think of it as a lightweight, versioned store for structured data, with a web dashboard to manage everything.

## Getting started

> **Setup instructions are coming soon.** StashJSON is still being prepared for general availability, so sign-up and installation details will land here once they're finalized. In the meantime, the sections below explain what the product does and how it works.

<!-- TODO: hosted sign-up flow, plan selection, and first-API-key walkthrough go here once GA is ready. -->

## What is StashJSON?

At its core, StashJSON does one thing well: it stores JSON documents and remembers how they change over time.

- **Documents** — Save any valid JSON as a document and read it back by its ID. Each document can be private (only you can read it) or public (anyone with the link can read it).
- **Workspaces** — Group related documents together. A workspace is a simple container that keeps your data organized as it grows.
- **Templates** — Optionally attach a JSON Schema to a workspace so every document in it must follow the same shape. Anything that doesn't match is rejected, so your data stays consistent.
- **Version history** — Every time you update a document, StashJSON snapshots the previous state first. You get a complete, automatic history and can look back at any earlier version.

Everything is available two ways: through a **REST API** for your apps and scripts, and through a **web dashboard** for browsing and managing your data by hand.

## How does it work?

1. **Sign in** to the dashboard and create an account.
2. **Generate an API key** — this is how your apps and scripts prove who they are.
3. **Create a workspace** to hold a set of related documents (and, if you like, give it a template to enforce a consistent shape).
4. **Store documents** — send JSON to the API, or add them from the dashboard. Each one gets a unique ID.
5. **Read, update, and organize** — fetch documents by ID, update them (StashJSON versions each change for you), and browse their history anytime.

Public documents can be read by anyone with the link; private documents require your API key. The dashboard and the API stay in sync — data you create one way shows up the other.

## Who is it for?

StashJSON is built for **developers, small teams, and makers** who need to persist structured data but don't want the overhead of running a database:

- **Prototypers and indie hackers** who want a quick backend for storing app data without provisioning infrastructure.
- **Developers** who need somewhere to keep configuration, content, or user-generated JSON with a reliable change history.
- **Teams** that want shared, organized document storage with schema validation to keep everyone's data consistent.
- **Anyone** who has reached for "a database, but simpler" and just wants to save and fetch JSON over HTTP.

## Key features at a glance

| Feature | What it gives you |
| --- | --- |
| REST API | Store and retrieve JSON over simple HTTP calls, authenticated with an API key. |
| Web dashboard | Browse, create, and manage documents and workspaces without writing code. |
| Workspaces | Organize related documents into tidy, self-contained groups. |
| Schema templates | Enforce a consistent JSON Schema across a workspace so data stays valid. |
| Automatic versioning | Every update is snapshotted — nothing is ever silently overwritten. |
| Public & private docs | Share individual documents publicly, or keep them locked to your key. |

## Learn more

- **Technical & architecture details:** see [`CLAUDE.md`](./CLAUDE.md) for how the app is built, the data model, and the internals.

---

StashJSON is built with Next.js, TypeScript, Prisma, and PostgreSQL.
