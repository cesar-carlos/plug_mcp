/**
 * Recusa texto de persona que parece senha, token ou JWT.
 * Não redige nem persiste: o caso de uso lança VALIDATION_ERROR.
 */
export const pareceSegredoEmTexto = (texto: string): boolean => {
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(texto)) {
    return true;
  }
  if (/\bbearer\s+[A-Za-z0-9._\-+=/]{16,}/i.test(texto)) {
    return true;
  }
  if (/"client[_-]?token"\s*:\s*"[^"]+"/i.test(texto)) {
    return true;
  }
  if (/\bclient[_-]?token\s*[=:]\s*\S{8,}/i.test(texto)) {
    return true;
  }
  if (/\b(?:password|passwd|senha)\s*[=:]\s*\S{6,}/i.test(texto)) {
    return true;
  }
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(texto)) {
    return true;
  }
  if (/\bauthorization\s*:\s*bearer\s+\S+/i.test(texto)) {
    return true;
  }
  return false;
};
