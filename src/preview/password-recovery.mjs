export function takePasswordRecoveryLink(url, history) {
  const params = new URL(url).searchParams;
  const language = params.get('lang') === 'en' ? 'en' : 'pt';
  const callbackFailed = params.has('error') || params.getAll('token').length > 1;
  const token = callbackFailed ? null : params.get('token') || null;
  const invalidLink = callbackFailed || (params.has('token') && !token);
  if (params.has('token') || params.has('error')) {
    const cleanUrl = passwordRecoveryUrl(url, language);
    history.replaceState(null, '', cleanUrl);
  }
  return { token, invalidLink, language };
}

export function passwordRecoveryUrl(currentUrl, language) {
  const target = new URL('./redefinir-senha.html', currentUrl);
  target.searchParams.set('lang', language === 'en' ? 'en' : 'pt');
  return target.href;
}

export function createPasswordRecovery(auth, currentUrl) {
  const fetchOptions = { timeout: 15000, retry: 0 };
  return {
    async requestLink(email, language) {
      const { error } = await auth.requestPasswordReset({
        email,
        redirectTo: passwordRecoveryUrl(currentUrl, language),
      }, fetchOptions);
      return error ? 'requestFailed' : 'requestAccepted';
    },
    async resetPassword(token, newPassword) {
      try {
        const { data, error } = await auth.resetPassword({ token, newPassword }, fetchOptions);
        if (error) return resetErrorStatus(error);
        return data?.status === true ? 'passwordChanged' : 'resetFailed';
      } catch (error) { return resetErrorStatus(error); }
    },
  };
}

function resetErrorStatus(error) {
  const code = error?.error?.code ?? error?.code;
  return ['INVALID_TOKEN', 'TOKEN_EXPIRED'].includes(code) ? 'invalidLink' : 'resetFailed';
}
