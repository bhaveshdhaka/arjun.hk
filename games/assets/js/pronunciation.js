export function makeSpeaker(synth, utteranceCtor) {
  if (!synth || typeof synth.speak !== 'function' || typeof utteranceCtor !== 'function') {
    return () => false;
  }
  return (text, lang = 'en-US') => {
    try {
      synth.cancel();
      const u = new utteranceCtor(String(text));
      u.lang = lang;
      u.rate = 0.85;
      synth.speak(u);
      return true;
    } catch {
      return false;
    }
  };
}
