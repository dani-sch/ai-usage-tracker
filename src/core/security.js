export function allowedExternal(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['auth.openai.com', 'chatgpt.com', 'developers.openai.com', 'learn.chatgpt.com', 'platform.openai.com', 'github.com', 'docs.github.com', 'claude.ai', 'code.claude.com', 'platform.claude.com', 'console.anthropic.com'].includes(u.hostname);
  } catch { return false; }
}
export function publicAccount(account, connected, refreshing) {
  return { ...account, connected, refreshing }; // Credentials live exclusively in Vault / CLI keyring.
}
