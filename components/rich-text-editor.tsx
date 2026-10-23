'use client';

import { useState, type ReactNode } from 'react';
import {
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  TextBIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextItalicIcon,
} from '@phosphor-icons/react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import type { RichTextDoc } from '@/lib/schemas/common';

// Matches lib/domain/rich-text.ts, which renders what this editor writes.
const EXTENSIONS = [
  StarterKit.configure({
    link: { openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
  }),
];

function Tool({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn('text-muted-foreground', active && 'bg-card text-foreground ring-border shadow-none ring-1')}
    >
      {children}
    </Button>
  );
}

function LinkField({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const current = editor.getAttributes('link').href;
  const [href, setHref] = useState(typeof current === 'string' ? current : '');
  const apply = () => {
    const value = href.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (value) chain.setLink({ href: /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}` }).run();
    else chain.unsetLink().run();
    onDone();
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-2 py-2">
      <Input
        autoFocus
        value={href}
        placeholder="https://"
        aria-label="Link address"
        className="h-8 min-w-0 flex-1"
        onChange={(event) => setHref(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply();
          }
          if (event.key === 'Escape') onDone();
        }}
      />
      <Button type="button" size="sm" onClick={apply}>
        {href.trim() ? 'Apply link' : 'Remove link'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

// Tiptap StarterKit (ADR-11). Writes the document as JSON to a hidden input `name` on every change.
export function RichTextEditor({
  name,
  initial,
  placeholder,
  onChange,
}: {
  name: string;
  initial?: RichTextDoc | null;
  placeholder?: string;
  // The same JSON string the hidden input holds ('' while empty), for a parent that saves as the person types (M04).
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(() => (initial ? JSON.stringify(initial) : ''));
  const [linking, setLinking] = useState(false);
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: initial ?? '',
    immediatelyRender: false,
    editorProps: { attributes: { class: 'prose-lms min-h-40 px-4 py-3 outline-none' } },
    onUpdate: ({ editor }) => {
      const next = editor.isEmpty ? '' : JSON.stringify(editor.getJSON());
      setValue(next);
      onChange?.(next);
    },
  });
  // Tiptap 3 does not re-render on every transaction; the toolbar reads just the state it shows.
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor && {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        h2: editor.isActive('heading', { level: 2 }),
        h3: editor.isActive('heading', { level: 3 }),
        bullets: editor.isActive('bulletList'),
        numbers: editor.isActive('orderedList'),
        link: editor.isActive('link'),
        undo: editor.can().undo(),
        redo: editor.can().redo(),
        empty: editor.isEmpty,
      },
  });
  const run = (command: (editor: Editor) => void) => () => editor && command(editor);

  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/30 bg-card overflow-hidden rounded-lg border transition-shadow focus-within:ring-[3px]">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="bg-muted/60 flex flex-wrap items-center gap-0.5 border-b p-1"
      >
        <Tool label="Bold" active={state?.bold} onClick={run((e) => e.chain().focus().toggleBold().run())}>
          <TextBIcon weight="bold" />
        </Tool>
        <Tool label="Italic" active={state?.italic} onClick={run((e) => e.chain().focus().toggleItalic().run())}>
          <TextItalicIcon weight="bold" />
        </Tool>
        <span aria-hidden="true" className="bg-border mx-1 h-5 w-px" />
        <Tool
          label="Heading"
          active={state?.h2}
          onClick={run((e) => e.chain().focus().toggleHeading({ level: 2 }).run())}
        >
          <TextHTwoIcon weight="bold" />
        </Tool>
        <Tool
          label="Subheading"
          active={state?.h3}
          onClick={run((e) => e.chain().focus().toggleHeading({ level: 3 }).run())}
        >
          <TextHThreeIcon weight="bold" />
        </Tool>
        <span aria-hidden="true" className="bg-border mx-1 h-5 w-px" />
        <Tool
          label="Bulleted list"
          active={state?.bullets}
          onClick={run((e) => e.chain().focus().toggleBulletList().run())}
        >
          <ListBulletsIcon weight="bold" />
        </Tool>
        <Tool
          label="Numbered list"
          active={state?.numbers}
          onClick={run((e) => e.chain().focus().toggleOrderedList().run())}
        >
          <ListNumbersIcon weight="bold" />
        </Tool>
        <Tool label="Link" active={state?.link || linking} onClick={() => setLinking((open) => !open)}>
          <LinkSimpleIcon weight="bold" />
        </Tool>
        <span aria-hidden="true" className="bg-border mx-1 h-5 w-px" />
        <Tool label="Undo" disabled={!state?.undo} onClick={run((e) => e.chain().focus().undo().run())}>
          <ArrowUUpLeftIcon weight="bold" />
        </Tool>
        <Tool label="Redo" disabled={!state?.redo} onClick={run((e) => e.chain().focus().redo().run())}>
          <ArrowUUpRightIcon weight="bold" />
        </Tool>
      </div>
      {linking && editor && <LinkField editor={editor} onDone={() => setLinking(false)} />}
      <div className="relative">
        {placeholder && (state?.empty ?? !initial) && (
          <p aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-3 left-4 text-sm">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
