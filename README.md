# NFL Cap Tracker v5.0

A local, tracker-only NFL salary-cap dashboard. No transaction simulation or GM sandbox is included in this build.

## New in v5

- Dedicated **player contract pages** with total value, APY, guarantees, signing bonus field, expiration, projected FA status, source audit, confidence rating, and year-by-year contract table.
- **League Cap Rankings** sortable by cap space, dead money, active spending, adjusted cap, or verified player cap hits.
- **Contract Expirations** by year with UFA/RFA/ERFA projection when an explicit designation is not available.
- **Position Spending** rankings across all 32 teams for QB, RB, WR, TE, OL, EDGE, DL, LB, secondary, and special teams.
- **Global Player Search** across the full league.
- **League and team cap-hit leaders**.
- Source-confidence badges based on cross-check coverage.
- Future-year salary fields remain `$0` and marked **UNSOURCED** until a source actually provides those values; the app does not fabricate future contract structures.

## Data pipeline

The full league update runs independent layers so one source failure does not stop the rest:

1. ESPN — roster membership and league news / roster movement detection.
2. StickToTheModel — primary current-year player cap table (cap hit, base salary, dead cap, cut savings) and team summary where available.
3. PFN team-cap tracker — team-level cap totals cross-check.
4. xEP — contract value, APY, guarantees, years, signing year, and current cap-hit cross-check where matched.
5. PFN team contract pages — fallback / secondary player contract cross-check.

## Run on macOS

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Then click **Update entire league**.

## Important accuracy behavior

- `$0` means no sourced value has been found for that field yet unless the source itself truly reports zero.
- Player pages show **HIGH / MEDIUM / LOW** source confidence.
- UFA/RFA/ERFA entries with an asterisk are projections derived from the player experience and known contract expiration. They are not presented as directly sourced league designations.
- Future yearly contract rows remain unsourced until the database contains actual year-level terms.

---

## V6 Website Edition
This folder is deployable to Vercel with persistent Supabase Postgres storage and scheduled full-league updates. See `DEPLOY.md` for the exact setup.
