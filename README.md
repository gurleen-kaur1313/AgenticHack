# MindMesh

MindMesh is a frontend-first hackathon MVP for an autonomous mental wellness orchestration platform. It demonstrates live behavioral signal monitoring, multi-agent workflow visualization, mood and stress analytics, journal signal capture, and autonomous intervention deployment.

## Tech Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-compatible component setup
- lucide-react
- recharts
- framer-motion

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Useful Scripts

```bash
npm run dev       # start the local development server
npm run build     # compile the production build
npm run typecheck # run TypeScript without emitting files
```

## Project Structure

```text
app/
  page.tsx
  layout.tsx
  globals.css
components/
  dashboard/
  agents/
  journal/
  intervention/
  analytics/
lib/
  api.ts
  mock-data.ts
  types.ts
  utils.ts
```

## Backend Integration Placeholder

The app is currently static/mock-data driven for a 4-5 hour MVP build. Future FastAPI integration points live in `lib/api.ts`, including typed fetch helpers and a WebSocket factory for real-time session signals.
