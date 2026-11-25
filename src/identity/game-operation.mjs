// O identificador permanece pendente até o resultado ser apresentado à mesma sessão.
export async function completeGameOperation({ ensureSession, claim, send, readState, present, clear }, concurrent = false) {
  await ensureSession();
  const operation = await claim();
  let responses;
  try {
    responses = await Promise.all(concurrent ? [send(operation), send(operation)] : [send(operation)]);
  } catch (error) {
    if (!['operation_expired', 'operation_clock'].includes(error?.message)) throw error;
    responses = [{ status: error.message, replayed: false }];
  }
  if (!responses.every((row) => ['ok', 'no_balance', 'operation_expired', 'operation_clock'].includes(row?.status) && typeof row.replayed === 'boolean')) {
    throw new Error('invalid_result');
  }
  const state = await readState();
  await ensureSession();
  // Não há await entre a última verificação e a apresentação.
  present(responses, state);
  await clear(operation);
  return responses;
}
