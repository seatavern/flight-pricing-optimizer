# Automatic deployment

Every push to `main` starts `.github/workflows/deploy.yml`. You can also run it
manually from GitHub Actions, selecting `main`.

The workflow runs frontend lint, generated Next.js type checks, simulator tests
and the Python test suite. It builds the existing Dockerfile and runs a local
container smoke test of the frontend, `/health`, and `/model/status` before
pushing the tested image to Azure Container Registry.

Next.js, FastAPI and the public proxy remain in one image. The public port stays
3000. The frontend is built with same-origin API URLs.

## Azure resources

- Subscription: `a4829d72-3f4a-4b3e-ab5a-b4bbb8156fa9`
- Resource group: `rg-energy-optimizer`
- Existing app: `flight-pricing-optimizer`
- Existing registry: `ca24794f8624acr.azurecr.io`
- Deployment identity: `id-flight-pricing-github`

The identity trusts only
`repo:seatavern/flight-pricing-optimizer:ref:refs/heads/main` from GitHub's OIDC
issuer. It has `AcrPush` on the existing registry and `Container Apps Contributor`
on this app. Client, tenant and subscription IDs in the workflow are public
identifiers, not credentials. No client secret or registry password is stored
in GitHub. The app's existing registry pull authentication is preserved.

## Deployment and rollback

Images use the full Git commit SHA as their tag. Deployment updates only the
named container's image, retaining the app and its public URL. The deployment
script compares the configuration before and after updating and waits for the
new revision to be ready. It then checks the public frontend, health endpoint
and trained model. If verification fails, it restores the previous image and
marks the workflow failed. GitHub's run summary records both image references.

The app trains a default demand model during startup. A new deployment or a
restart resets any model retrained interactively; this is the existing behavior.

## Costs

Builds and tests run on GitHub-hosted runners. This setup reuses the existing
Basic registry, app, environment and logging workspace, preserving scale-to-zero
and resource allocation. Deployments incur normal image storage, startup compute
and logging usage. Historical image tags are retained for rollback; review
registry storage as the number of releases grows. GitHub Actions usage follows
the repository's billing plan.

## Local checks

```sh
npm ci
npm run lint
npm run typecheck
npm test
cd backend
python -m pip install -r requirements.txt
python -m pytest
```
