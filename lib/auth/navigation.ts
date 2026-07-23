function safeReturnTo(returnTo: string): string {
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return "/";
  return returnTo;
}

export function chatGPTSignInUrl(returnTo = "/"): string {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export function chatGPTSignOutUrl(returnTo = "/"): string {
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export function chatGPTSwitchUserUrl(returnTo = "/"): string {
  return chatGPTSignOutUrl(chatGPTSignInUrl(returnTo));
}
