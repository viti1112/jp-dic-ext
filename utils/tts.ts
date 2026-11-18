/** Reads Japanese text aloud via the browser's built-in Web Speech API - no network call, no API key. */
export function speakJapanese(text: string): void {
  if (!text || typeof speechSynthesis === 'undefined') return;

  speechSynthesis.cancel(); // stop whatever (if anything) was already playing
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  speechSynthesis.speak(utterance);
}
