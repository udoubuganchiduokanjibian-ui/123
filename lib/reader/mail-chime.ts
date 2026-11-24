function scheduleMailChime(
  context: AudioContext,
  output: AudioNode,
  delayMs: number,
) {
  const start = context.currentTime + delayMs / 1000;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = "sine";
  oscillator.connect(volume).connect(output);
  volume.gain.setValueAtTime(0, context.currentTime);

  [740, 880, 1047].forEach((frequency, index) => {
    const at = start + index * 0.13;
    oscillator.frequency.setValueAtTime(frequency, at);
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(0.13, at + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.001, at + 0.085);
    volume.gain.setValueAtTime(0, at + 0.09);
  });

  let ended = false;
  oscillator.addEventListener("ended", () => {
    ended = true;
    oscillator.disconnect();
    volume.disconnect();
  }, { once: true });
  oscillator.start(start);
  oscillator.stop(start + 0.36);
  return () => {
    if (!ended) oscillator.stop();
  };
}

export function repeatMailChime(context: AudioContext, output: AudioNode, firstDelayMs: number) {
  const intervalMs = 4000;
  let stopChime = scheduleMailChime(context, output, firstDelayMs);
  let timer: number | undefined = window.setTimeout(playAgain, firstDelayMs + intervalMs);

  function playAgain() {
    if (context.state === "running") stopChime = scheduleMailChime(context, output, 0);
    timer = window.setTimeout(playAgain, intervalMs);
  }

  return () => {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
    stopChime();
  };
}
