'use client';

import { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';

// TP-09 (mock-up B3): a code question's editor — CodeMirror 6, dark, with C/C++ or Java highlighting; a language the
// codeRunner setting adds beyond those is plain text. The runner loads this file only when a code question shows.
export function CodeEditor({
  value,
  language,
  label,
  onChange,
}: {
  value: string;
  language: string;
  label: string;
  onChange: (value: string) => void;
}) {
  // Rebuilt only when the language or label changes: new extensions reconfigure the editor.
  const extensions = useMemo(
    () => [
      EditorView.contentAttributes.of({ 'aria-label': label }),
      ...(language === 'java' ? [java()] : language === 'c' || language === 'cpp' ? [cpp()] : []),
    ],
    [language, label],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="dark"
      height="100%"
      className="h-full text-[0.875rem]"
      basicSetup={{ foldGutter: false }}
    />
  );
}
