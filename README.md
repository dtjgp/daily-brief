# daily-brief

Automated daily brief from 4 sources:

1. Hacker News
2. GitHub Trending (real-time trending page parsing)
3. Product Hunt feed
4. X monitored stream (from local `X 日报` latest markdown)

## Run locally

```bash
npm run build
```

Outputs:
- `data/YYYY-MM-DD.json`
- `daily/YYYY-MM-DD.md`
- `site/index.md`
- `site/index.html`

## GitHub Actions

Workflow: `.github/workflows/daily-brief.yml`

- Runs daily at `08:00 UTC` (roughly 09:00 Europe/Rome in winter)
- Also supports manual trigger (`workflow_dispatch`)
- Auto-commits generated files
- Deploys `site/` to GitHub Pages

## Notes

- Product Hunt feed is best-effort (public feed availability may vary).
- X section is only available when local X report path exists.
- Each item includes a one-line summary for quick review.
