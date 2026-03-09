# iShift

A browser-based shift scheduling tool for small teams.

**Live site:** https://anicoll.github.io/ishift/

## Features

- **Workers** — manage your team with roles, tag-based qualifications, availability windows, and max shifts per week
- **Shift types** — define shifts with start/end times, required tags, and minimum worker counts
- **Schedule** — assign workers to shifts across a weekly calendar view, with auto-scheduling based on eligibility and availability
- **Tags** — create skill or certification tags (e.g. "First Aid", "Forklift Licensed") to filter eligible workers per shift
- **Persistent state** — all data is saved to browser `localStorage`, so your schedule is preserved across page reloads and computer restarts

## Tech

- React + TypeScript
- Vite
- localStorage for persistence (no backend required)

## Development

```bash
npm install
npm run dev
```
