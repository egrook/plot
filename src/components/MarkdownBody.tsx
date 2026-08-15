import type { ComponentPropsWithoutRef } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-markdown-preview/markdown.css";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { PluggableList } from "unified";
import { openFileUrl } from "@/lib/files";
import { parseWikiHref, remarkWikiLinks, WIKI_PREFIX } from "@/lib/wiki";
import { cn } from "@/lib/utils";

type Props = {
  source: string;
  className?: string;
  onWikiLink?: (title: string) => void;
};

const WIKI_PROTOCOL = WIKI_PREFIX.replace(/:$/, "");

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), WIKI_PROTOCOL],
  },
};

const rehypePlugins: PluggableList = [[rehypeSanitize, sanitizeSchema]];

export function markdownPreviewOptions(onWikiLink?: (title: string) => void) {
  return {
    remarkPlugins: [remarkWikiLinks],
    rehypePlugins,
    components: {
      a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => {
        const wiki = parseWikiHref(href);
        if (wiki) {
          return (
            <a
              {...props}
              href={href}
              className="wiki-link nodrag nopan"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onWikiLink?.(wiki);
              }}
            >
              {children}
            </a>
          );
        }
        if (href?.startsWith("/api/files/")) {
          return (
            <a
              {...props}
              href={href}
              className="nodrag nopan"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openFileUrl(href);
              }}
            >
              {children}
            </a>
          );
        }
        return (
          <a {...props} href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
    },
  };
}

export function MarkdownBody({ source, className, onWikiLink }: Props) {
  const options = markdownPreviewOptions(onWikiLink);
  return (
    <div className={cn("md-preview", className)} data-color-mode="dark">
      <MDEditor.Markdown
        source={source}
        remarkPlugins={options.remarkPlugins}
        rehypePlugins={options.rehypePlugins}
        components={options.components}
      />
    </div>
  );
}
