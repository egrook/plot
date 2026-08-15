import { now, queries } from "./db";

const WELCOME_MARKDOWN = `# Welcome to Plot

This board is your **desk**. Drop notes beside drawings and pull threads between them.

## Try this
- Double-click a card to open it
- Drag the handles to **link** ideas
- \`N\` adds a note, \`D\` adds a drawing
- Resize from the corner, pan the empty canvas

Write as much as you need. Markdown is the whole point of this card:

\`\`\`ts
const idea = "sketch first, then write the brief";
\`\`\`

> Link this note to the drawing on the right when the shape of the project clicks.
`;

export async function seedStarterProject(userId: string) {
  const projectId = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  const drawId = crypto.randomUUID();
  const edgeId = crypto.randomUUID();
  const t = now();

  await queries.createProject.run(
    projectId,
    userId,
    "Starter board",
    "A first desk to write on and sketch into.",
    "#71717a",
    JSON.stringify({ x: 80, y: 60, zoom: 1 }),
    t,
    t,
  );

  await queries.createNode.run(
    noteId,
    projectId,
    "markdown",
    "How this board works",
    WELCOME_MARKDOWN,
    null,
    40,
    40,
    380,
    460,
    "",
    "todo",
    "",
    t,
    t,
  );

  await queries.createNode.run(
    drawId,
    projectId,
    "excalidraw",
    "Sketch the shape",
    JSON.stringify({
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    }),
    null,
    480,
    80,
    420,
    320,
    "",
    "todo",
    "",
    t,
    t,
  );

  await queries.createEdge.run(
    edgeId,
    projectId,
    noteId,
    drawId,
    "right",
    "left",
    "then draw it",
    t,
  );

  return projectId;
}
