// M03c T9: the Web Speech API's recognizer, which TypeScript's DOM library leaves out (it is not a standard yet; its
// result types are there). Chrome has it as `webkitSpeechRecognition` and Edge as both names; Safari and Firefox do not.
// Chrome and Edge send the audio to their maker's servers to recognise it (decision 6).

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { readonly error: string }) => void) | null;
  start(): void;
  stop(): void;
}

interface Window {
  readonly SpeechRecognition?: new () => SpeechRecognition;
  readonly webkitSpeechRecognition?: new () => SpeechRecognition;
}
