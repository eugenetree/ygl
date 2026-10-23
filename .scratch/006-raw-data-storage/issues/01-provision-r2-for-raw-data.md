# 01 — Provision R2 for raw data

**What to build:** the R2 setup the scraper needs before raw data storage can be verified or deployed. Spec: `.scratch/006-raw-data-storage/spec.md`. Decision: `docs/adr/0014-raw-data-in-its-own-r2-bucket.md`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [ ] A private R2 bucket for raw data exists, separate from the `saythis` database backup bucket, with no lifecycle rule
- [ ] An R2 API token scoped to *Object Read & Write* on that bucket only exists, and cannot touch the backup bucket
- [ ] A dev bucket and token exist for local runs and the network test
- [ ] The scraper's raw data variables (endpoint, access key id, secret access key, bucket) are set in Dokploy, and the dev values in the local `.env`
- [ ] `APP_ENV=production` is set for the scraper in Dokploy (it may be unset today)
