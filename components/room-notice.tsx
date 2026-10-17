import type { ReactNode } from 'react';

// A message in place of the live room, centred on the room's dark stage (M03b): the room page's states before and
// after a class, and `LiveRoom`'s own when the viewer has left or lost the room. Plain markup, so the server page and
// the client room both render it.
export function RoomNotice({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-6 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <h1 className="text-lg font-semibold text-balance">{title}</h1>
        {text && <p className="text-sm text-pretty text-white/70">{text}</p>}
        {children}
      </div>
    </div>
  );
}
