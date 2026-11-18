// Apresenta somente categorias conhecidas, sem exibir dados enviados ao serviço.
export function describeLoginError(error) {
  const providerCode = error?.error?.code ?? error?.code;
  if (providerCode === 'INVALID_EMAIL_OR_PASSWORD' || error?.code === 'invalid_credentials') {
    return 'A Neon não reconheceu o e-mail ou a senha. Confira os dados da conta fictícia.';
  }
  if (providerCode === 'INVALID_ORIGIN' || providerCode === 'MISSING_OR_NULL_ORIGIN') {
    return 'A Neon recusou a origem da página. A configuração precisa ser verificada.';
  }
  if (error instanceof TypeError) return 'Não foi possível conectar ao serviço de autenticação. Confira a conexão e tente novamente.';
  return 'Não foi possível confirmar a entrada. A autenticação precisa ser verificada.';
}
