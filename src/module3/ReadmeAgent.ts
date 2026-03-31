import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LLM, Message, Tool, ToolFactory } from '../shared';
import { Goal, buildSystemPrompt } from '../shared/Goal';
import { Memory } from '../shared/Memory';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// README AGENT — Module 3 course exercise
//
// This agent applies the GAME framework to a meta task: analysing this
// project's own TypeScript source files and generating a README.md.
//
// It demonstrates:
//   - Goals with priorities driving a multi-step discovery process
//   - File-system tools as the Environment
//   - Memory accumulating file contents across iterations
//   - terminate() delivering the final README as its argument
//
// The README it generates is then reviewed and committed as the actual
// project README — the exercise produces a real artifact.
// ─────────────────────────────────────────────────────────────────────────────

// ── G: GOALS ─────────────────────────────────────────────────────────────────

const README_GOALS: Goal[] = [
  {
    name: 'Discover source files',
    description: 'List all TypeScript source files in the project to understand its structure.',
    priority: 10,
  },
  {
    name: 'Analyse key files',
    description:
      'Read the most important source files: shared utilities, the agent entry point, ' +
      'and at least one module example. Build a clear picture of what the project does.',
    priority: 8,
  },
  {
    name: 'Generate README',
    description:
      'Write a complete README.md for the project. It must cover: what the project is, ' +
      'the two goals (learning + business), how to set it up, how to run each script, ' +
      'the project structure, what is simulated vs what would be real, and what comes next.',
    priority: 5,
  },
];

const README_PERSONA =
  'You are a technical writer and senior TypeScript developer. ' +
  'Your job is to read source code and produce clear, accurate documentation ' +
  'for a developer audience. Write in plain English. Be concise but complete. ' +
  'Use GitHub-flavoured Markdown. ' +
  'IMPORTANT: You must always deliver your final README by calling the terminate() tool ' +
  'with the complete Markdown text as the answer argument. Never output the README as plain text.';

// ── A: TOOLS ──────────────────────────────────────────────────────────────────

// The src root — all file operations are scoped here for safety
const SRC_ROOT = path.resolve(process.cwd(), 'src');
const PROJECT_ROOT = path.resolve(process.cwd());

function buildReadmeTools(): Tool[] {
  return [
    {
      name: 'list_typescript_files',
      description:
        'Lists all TypeScript source files in the project (excludes test files). ' +
        'Returns an array of relative file paths. Call this first to discover the structure.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'read_source_file',
      description:
        'Reads the contents of a TypeScript source file. ' +
        'Only files inside the src/ directory can be read. ' +
        'If the file does not exist or is outside src/, returns an error.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description:
              'Relative path from the project root, e.g. "src/shared/LLM.ts". ' +
              'Must start with "src/".',
          },
        },
        required: ['file_path'],
      },
    },
    {
      name: 'read_project_file',
      description:
        'Reads a non-source project file such as package.json or CLAUDE.md. ' +
        'Useful for understanding scripts, dependencies, and project context.',
      parameters: {
        type: 'object',
        properties: {
          file_name: {
            type: 'string',
            description: 'File name in the project root, e.g. "package.json" or "CLAUDE.md".',
          },
        },
        required: ['file_name'],
      },
    },
    ToolFactory.terminate(),
  ];
}

// ── E: ENVIRONMENT ────────────────────────────────────────────────────────────

function listTypeScriptFiles(): string {
  const results: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        // Return paths relative to the project root for readability
        results.push(path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/'));
      }
    }
  }

  walk(SRC_ROOT);
  return JSON.stringify({ files: results });
}

function readSourceFile(filePath: string): string {
  // Safety: only allow reading files inside src/
  const resolved = path.resolve(PROJECT_ROOT, filePath);
  if (!resolved.startsWith(SRC_ROOT)) {
    return JSON.stringify({
      error: `Access denied: "${filePath}" is outside src/. ` +
             `Call list_typescript_files to get valid file paths.`,
    });
  }
  if (!fs.existsSync(resolved)) {
    return JSON.stringify({
      error: `File not found: "${filePath}". ` +
             `Call list_typescript_files to get valid file paths.`,
    });
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  // Truncate very large files to avoid hitting token limits
  const MAX_CHARS = 4000;
  const truncated = content.length > MAX_CHARS;
  return JSON.stringify({
    file: filePath,
    content: truncated ? content.slice(0, MAX_CHARS) + '\n... [truncated]' : content,
    truncated,
  });
}

function readProjectFile(fileName: string): string {
  // Only allow specific safe files — no path traversal
  const ALLOWED = ['package.json', 'CLAUDE.md', 'SESSION.md', 'tsconfig.json'];
  if (!ALLOWED.includes(fileName)) {
    return JSON.stringify({
      error: `"${fileName}" is not in the allowed list: ${ALLOWED.join(', ')}`,
    });
  }
  const resolved = path.join(PROJECT_ROOT, fileName);
  if (!fs.existsSync(resolved)) {
    return JSON.stringify({ error: `File not found: "${fileName}"` });
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  const MAX_CHARS = 3000;
  return JSON.stringify({
    file: fileName,
    content: content.length > MAX_CHARS
      ? content.slice(0, MAX_CHARS) + '\n... [truncated]'
      : content,
  });
}

function dispatchTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'list_typescript_files':
      return listTypeScriptFiles();
    case 'read_source_file':
      return readSourceFile(args['file_path'] as string);
    case 'read_project_file':
      return readProjectFile(args['file_name'] as string);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ── AGENT LOOP ────────────────────────────────────────────────────────────────

async function runReadmeAgent(maxIterations: number = 15): Promise<string | null> {
  console.log('\n' + '='.repeat(70));
  console.log('README AGENT');
  console.log('='.repeat(70));

  const llm = new LLM();
  const memory = new Memory();
  const tools = buildReadmeTools();
  const systemPrompt = buildSystemPrompt(README_PERSONA, README_GOALS);

  memory.addMessage(Message.system(systemPrompt));
  memory.addMessage(Message.user(
    'Analyse this TypeScript project and generate a complete README.md. ' +
    'Start by listing the source files to understand the structure.'
  ));

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`ITERATION ${iteration}`);
    console.log('─'.repeat(70));

    const response = await llm.generateWithTools(memory.getMessages(), tools);

    if (response.type === 'text') {
      // The model output the README as plain text instead of via terminate().
      // We accept it — it's still valid content — but log the deviation.
      console.log('\n[AGENT NOTE] Model responded with plain text instead of terminate().');
      if (response.content.trim().length > 100) {
        return response.content;
      }
      return null;
    }

    memory.addMessage(response.assistantMessage);

    for (const call of response.calls) {
      console.log(`\n  [TOOL] ${call.name}(${
        call.name === 'terminate' ? '...' : JSON.stringify(call.arguments)
      })`);

      if (call.name === 'terminate') {
        const readme = call.arguments['answer'] as string;
        console.log('\n[README AGENT] Generation complete.\n');
        return readme;
      }

      const result = dispatchTool(call.name, call.arguments);
      // Only print a preview for file reads — full content would flood the console
      const preview = result.length > 200 ? result.slice(0, 200) + '...' : result;
      console.log(`  [RESULT] ${preview}`);

      memory.addMessage(Message.tool(result, call.id));
    }
  }

  console.log('[README AGENT] Max iterations reached.');
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// Runs the agent and writes the output to README.md at the project root.
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const readme = await runReadmeAgent();

  if (!readme) {
    console.log('No README generated.');
    return;
  }

  const outPath = path.join(PROJECT_ROOT, 'README.md');
  fs.writeFileSync(outPath, readme, 'utf-8');
  console.log(`README written to: ${outPath}`);
  console.log('\n--- PREVIEW (first 1000 chars) ---\n');
  console.log(readme.slice(0, 1000));
  console.log('\n--- END PREVIEW ---');
}

main();
