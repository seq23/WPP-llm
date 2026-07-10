# Day-0 VA Runbook

1. Open `/admin/`.
2. Open **Credential Check** and run it. Missing optional providers are acceptable.
3. Open **Admin Command** and confirm runtime state is ACTIVE.
4. Run **Query Intelligence**.
5. Run **Full Content Release** with defaults 50/100.
6. Run **Distribution** after validation succeeds.
7. Review `data/admin/growth_health.json`, `artifacts/release/`, and GitHub workflow receipts.
8. Use Pause for planned stops and Emergency Stop for unsafe mutation. Never delete evidence.
