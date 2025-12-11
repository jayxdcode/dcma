export function createAudio(url) {
  const audio = new Audio(url);
  audio.crossOrigin = 'anonymous';
  return audio;
}
