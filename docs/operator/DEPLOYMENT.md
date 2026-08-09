# Deployment / Hosting Truth — VirtualAgency OS

Public domain: `https://virtualagency-os.com`  
Source branch: `main`  
Repository: `seq23/WPP-llm`

## Current evidence boundary

The repo-local provider readiness contract identifies **Cloudflare Pages** as the intended deployment provider. The repository contains build, validation, distribution, IndexNow, GSC, and post-push proof tooling, but it does **not** contain the authoritative Cloudflare Pages project binding or an in-repo deploy workflow. Provider/project binding therefore remains external configuration rather than source-controlled truth.

## Operator rule

Treat Cloudflare Pages as the governed provider intent from `docs/operator/PROVIDER_READINESS.md`. Before changing hosting configuration, identify the actual Cloudflare Pages project and branch binding from the owner account/dashboard and record them here. Until that provider-side binding is confirmed, deployment-provider status is `EXTERNAL_CONFIG_UNPROVEN`; this is an evidence gap, not permission to add a new hosting architecture.

## What this repo owns

- static source/output and canonical routing
- GitHub Actions validation and autonomous content workflows
- IndexNow / Google Search Console distribution preparation and submission
- live-proof/post-push checks when configured

## What this repo does not currently prove

- the provider project name
- provider-side branch binding
- provider-side automatic deploy settings
- provider-side cache/header configuration

This file intentionally records the boundary rather than guessing.
