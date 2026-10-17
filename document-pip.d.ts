// M03c T1: browser APIs the live room's mini window uses that TypeScript's DOM library does not have yet. Document
// Picture-in-Picture is in Chrome and Edge from version 116 (https://wicg.github.io/document-picture-in-picture/);
// Chrome 120+ opens it by itself when a page that uses the camera or microphone registers `enterpictureinpicture`.

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  readonly window: Window | null;
}

interface Window {
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}

interface MediaSession {
  setActionHandler(action: 'enterpictureinpicture', handler: MediaSessionActionHandler | null): void;
}
