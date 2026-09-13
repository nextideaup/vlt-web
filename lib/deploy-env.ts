// VLT-36 — which environment this deploy is, decided FAIL-CLOSED.
//
// NODE_ENV cannot answer this: the Dockerfile sets it to "production" in every
// image, so staging and production both say "production". DEPLOY_ENV can, and
// anything other than an explicitly named non-production environment — unset,
// empty, a typo — is treated as PRODUCTION. A forgotten Railway variable lands
// on the safe side, which is the whole point: the verifier door below refuses
// in production, and "I forgot to set DEPLOY_ENV" must never open it.

export const NON_PRODUCTION_ENVS = ["local", "development", "dev", "test", "staging"] as const;

export function deployEnv(): string {
  return (process.env.DEPLOY_ENV ?? "production").trim().toLowerCase();
}

export function isProduction(): boolean {
  return !(NON_PRODUCTION_ENVS as readonly string[]).includes(deployEnv());
}
