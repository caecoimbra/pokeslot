// Apenas funções que recusam este erro antes de qualquer escrita podem usar isto.
export const MISSING_IDENTITY_CODE = 'PZ001';
export const MISSING_IDENTITY_MESSAGE = 'identity context missing; request rejected before update';

export async function requestWithIdentityRetry(request, {
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
} = {}) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await request();
    const missingIdentity = result.error?.code === MISSING_IDENTITY_CODE
      && result.error?.message === MISSING_IDENTITY_MESSAGE;

    if (!missingIdentity || attempt === 5) return { ...result, attempts: attempt };
    // Intervalos crescentes e uma pequena variação evitam repetir tudo junto.
    const delay = 150 * 2 ** (attempt - 1) + Math.floor(random() * 151);
    await wait(delay);
  }
}
