"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import { Markdown } from "tiptap-markdown";
import {
  BoldIcon,
  ItalicIcon,
  ListBulletIcon,
  NumberedListIcon,
} from "@heroicons/react/24/outline";

interface RichMarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  hideToolbar?: boolean;
  minHeight?: string;
  maxHeight?: string;
  height?: string;
  className?: string;
}

/**
 * WYSIWYG editor that renders markdown as formatted content and edits in
 * place. Round-trips to markdown via the tiptap-markdown extension so the
 * underlying form value stays in markdown.
 */
export default function RichMarkdownEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  hideToolbar = false,
  minHeight,
  maxHeight,
  height,
  className,
}: RichMarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        paragraph: false,
      }),
      // Custom paragraph that preserves empty lines when serialised to markdown
      Paragraph.extend({
        addStorage() {
          return {
            markdown: {
              serialize(state: {
                renderInline: (node: unknown) => void;
                closeBlock: (node: unknown) => void;
                write: (text: string) => void;
              }, node: { childCount: number }) {
                if (node.childCount === 0) {
                  // Output a non-breaking space so re-parsing keeps the blank line
                  state.write("\u00A0");
                  state.closeBlock(node);
                } else {
                  state.renderInline(node);
                  state.closeBlock(node);
                }
              },
              parse: { setup() {} },
            },
          };
        },
      }),
      Markdown.configure({
        html: false,
        linkify: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel ?? "Editor",
        class:
          "max-w-none focus:outline-none text-[#2f3437] text-[15px] leading-relaxed " +
          "[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-3 [&_h1]:leading-tight " +
          "[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:leading-tight " +
          "[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:leading-tight " +
          "[&_p]:my-3 [&_p:empty]:min-h-[1em] " +
          "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 " +
          "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 " +
          "[&_li]:my-1 [&_li>p]:my-0 " +
          "[&_blockquote]:border-l-4 [&_blockquote]:border-[#6ba3c7] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#2f3437]/80 [&_blockquote]:my-3 " +
          "[&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[#d4d4d4] [&_hr]:my-6 " +
          "[&_strong]:font-semibold [&_strong]:text-[#2f3437] " +
          "[&_em]:italic [&_s]:line-through [&_s]:text-[#2f3437]/60 " +
          "[&_a]:text-[#6ba3c7] [&_a]:underline",
      },
    },
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown?.getMarkdown?.() ?? "";
      onChange(md);
    },
  });

  // Keep editor in sync if external value changes (e.g. AI tool prefill)
  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown?.getMarkdown?.() ?? "";
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-[#2f3437]/40">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {!hideToolbar && <Toolbar editor={editor} />}
      <div
        className={
          className ??
          `relative flex-1 min-h-0 overflow-auto rounded-lg border border-[#eaeaea] bg-white p-4 ${
            hideToolbar ? "" : "mt-2 p-6"
          }`
        }
        style={{
          ...(minHeight ? { minHeight } : {}),
          ...(maxHeight ? { maxHeight } : {}),
          ...(height ? { height } : {}),
        }}
        onClick={() => editor.chain().focus().run()}
      >
        {editor.isEmpty && placeholder && (
          <p
            className="pointer-events-none text-[#2f3437]/30 absolute select-none whitespace-normal break-words"
            style={{ width: "calc(100% - 2rem)" }}
          >
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-[12px] flex items-center gap-1 transition-colors ${
      active
        ? "bg-[#6ba3c7]/15 text-[#2f3437] font-medium"
        : "text-[#2f3437]/70 hover:text-[#2f3437] hover:bg-[#eaeaea]/60"
    }`;

  return (
    <div className="flex items-center flex-wrap gap-0.5 border border-[#eaeaea] rounded-lg bg-[#fafafa] px-1 py-1">
      <button
        type="button"
        className={btn(editor.isActive("heading", { level: 2 }))}
        title="Heading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        Heading
      </button>
      <button
        type="button"
        className={btn(editor.isActive("heading", { level: 3 }))}
        title="Sub-Heading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        Sub-Heading
      </button>
      <button
        type="button"
        className={btn(editor.isActive("paragraph"))}
        title="Paragraph"
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        P
      </button>
      <span className="w-px h-5 bg-[#eaeaea] mx-1" />
      <button
        type="button"
        className={btn(editor.isActive("bold"))}
        title="Bold (⌘B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("italic"))}
        title="Italic (⌘I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("strike"))}
        title="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        S
      </button>
      <span className="w-px h-5 bg-[#eaeaea] mx-1" />
      <button
        type="button"
        className={btn(editor.isActive("bulletList"))}
        title="Bulleted list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListBulletIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("orderedList"))}
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <NumberedListIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("blockquote"))}
        title="Quote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </button>
      <button
        type="button"
        className={btn(false)}
        title="Section divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <span className="inline-block w-4 border-t-2 border-current" />
      </button>
      <span className="w-px h-5 bg-[#eaeaea] mx-1" />
      <button
        type="button"
        className={btn(false)}
        title="Undo (⌘Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        ↶
      </button>
      <button
        type="button"
        className={btn(false)}
        title="Redo (⌘⇧Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        ↷
      </button>
    </div>
  );
}
