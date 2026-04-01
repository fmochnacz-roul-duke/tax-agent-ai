// ─────────────────────────────────────────────────────────────────────────────
// Web Server — Phase 8
//
// Express.js server that provides the conversational web UI for the WHT agent.
//
// Endpoints:
//   GET  /                      — serves the chat UI (src/public/index.html)
//   POST /session               — create a new conversation session
//   POST /session/:id/message   — send a user message; returns bot reply or "ready"
//   POST /session/:id/confirm   — user confirmed parameters; starts analysis
//   GET  /session/:id/stream    — SSE stream of analysis progress events
//   GET  /session/:id/report    — get the completed WhtReport as JSON
//
// Conversation flow:
//   1. Browser POSTs to /session to get a sessionId
//   2. Browser POSTs each user message to /session/:id/message
//      - Server runs InputExtractor → returns bot question or confirmation
//   3. User confirms → browser POSTs to /session/:id/confirm
//   4. Server starts runWhtAnalysis() in background
//   5. Browser connects to /session/:id/stream (SSE) to receive progress
//   6. When analysis completes, browser GETs /session/:id/report
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { AgentInput, AgentEvent, WhtReport, runWhtAnalysis } from '../agents/BeneficialOwnerAgent';
import { InputExtractor } from './InputExtractor';
import { SubstanceInterviewer, InterviewState } from './SubstanceInterviewer';
import { getRegistry } from './EntityRegistry';

dotenv.config();

const app  = express();
const PORT = process.env['PORT'] ?? 3000;

app.use(express.json());

// ── Session state ─────────────────────────────────────────────────────────────
//
// Each session tracks:
//   messages   — the conversation history (user + assistant turns)
//   input      — the extracted AgentInput once all required fields are present
//   status     — where in the flow this session is
//   report     — the completed WhtReport after analysis finishes
//   sseClients — SSE response objects waiting for analysis events

type SessionStatus = 'chatting' | 'confirmed' | 'interviewing' | 'running' | 'complete' | 'error';

interface Session {
  id:              string;
  messages:        { role: 'user' | 'assistant'; content: string }[];
  input?:          AgentInput;
  status:          SessionStatus;
  report?:         WhtReport;
  error?:          string;
  // Phase 10: substance interview state
  interviewer?:    SubstanceInterviewer;
  interviewState?: InterviewState;
  ddqText?:        string;
  // SSE: we keep Response objects open and write events to them
  sseClients:      Response[];
}

// In-memory session store — good enough for single-server use
const sessions = new Map<string, Session>();

const extractor = new InputExtractor();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSession(res: Response, id: string): Session | null {
  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  return session;
}

// Broadcast an event to all SSE clients connected to a session.
// Each event is a JSON-encoded line following the SSE protocol:
//   data: <json>\n\n
function broadcastEvent(session: Session, event: AgentEvent): void {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of session.sseClients) {
    client.write(line);
  }
}

// Generate a safe output path in the reports/ directory.
function reportPath(input: AgentInput): string {
  const slug = input.entity_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return path.resolve('reports', `${slug}_${date}.json`);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Serve the chat UI
app.get('/', (_req: Request, res: Response) => {
  const htmlPath = path.resolve(__dirname, '..', 'public', 'index.html');
  res.sendFile(htmlPath);
});

// ── POST /session — create a new session ──────────────────────────────────────
app.post('/session', (_req: Request, res: Response) => {
  const id: string = crypto.randomUUID();
  const session: Session = {
    id,
    messages:   [],
    status:     'chatting',
    sseClients: [],
  };
  sessions.set(id, session);
  res.json({ sessionId: id });
});

// ── POST /session/:id/message — handle a user chat message ────────────────────
//
// The client sends: { message: string }
// The server responds with one of:
//   { type: 'question', text: string }   — more info needed
//   { type: 'ready',    text: string }   — all params extracted; show confirmation
app.post('/session/:id/message', async (req: Request, res: Response) => {
  const session = getSession(res, String(req.params['id'] ?? ''));
  if (!session) return;

  if (session.status !== 'chatting' && session.status !== 'interviewing') {
    res.status(400).json({ error: `Session is in ${session.status} state — messages not accepted` });
    return;
  }

  const userMessage: string = (req.body as { message?: unknown })['message'] as string;
  if (typeof userMessage !== 'string' || userMessage.trim() === '') {
    res.status(400).json({ error: 'message must be a non-empty string' });
    return;
  }

  // Add user message to history
  session.messages.push({ role: 'user', content: userMessage.trim() });

  // ── Phase 10: interview mode ────────────────────────────────────────────────
  //
  // When status is 'interviewing', the user is answering the 5 substance
  // questions. Route each answer to the SubstanceInterviewer instead of the
  // InputExtractor. When all 5 answers are in, compile the DDQ text and
  // start runWhtAnalysis() in the background (same as the /confirm route
  // previously did for non-interview sessions).

  if (session.status === 'interviewing') {
    const { interviewer, interviewState, input } = session;

    if (!interviewer || !interviewState || !input) {
      res.status(500).json({ error: 'Interview state is missing — this is a server bug' });
      return;
    }

    const result = interviewer.answer(interviewState, userMessage.trim());

    if (result.status === 'in_progress') {
      // More questions remain — send the next one
      session.messages.push({ role: 'assistant', content: result.question });
      res.json({ type: 'interview_question', text: result.question });
      return;
    }

    // Interview complete — store the compiled DDQ text
    session.ddqText = result.ddqText;
    session.messages.push({ role: 'assistant', content: result.summary });

    // Transition to running and start analysis in background
    session.status = 'running';
    const outputPath = reportPath(input);

    runWhtAnalysis(input, session.ddqText, outputPath, (event: AgentEvent) => {
      broadcastEvent(session, event);
    })
      .then((report: WhtReport) => {
        session.report = report;
        session.status = 'complete';
        // Phase 11: save to the entity registry after every completed analysis.
        // getRegistry() returns the server-lifetime singleton so all sessions
        // share the same registry file (data/registry.json).
        getRegistry().save(report, outputPath);
        broadcastEvent(session, { type: 'report_saved', message: 'Analysis complete.', data: { report } });
        for (const client of session.sseClients) client.end();
        session.sseClients = [];
      })
      .catch((err: unknown) => {
        session.status = 'error';
        session.error  = String(err);
        broadcastEvent(session, { type: 'error' as AgentEvent['type'], message: `Analysis failed: ${String(err)}` });
        for (const client of session.sseClients) client.end();
        session.sseClients = [];
      });

    // Tell the browser the interview is done — it will open the SSE stream
    res.json({ type: 'interview_complete', text: result.summary });
    return;
  }

  // ── Normal chatting mode: run InputExtractor ────────────────────────────────

  let result;
  try {
    result = await extractor.extract(session.messages);
  } catch (err) {
    res.status(500).json({ error: `Extraction failed: ${String(err)}` });
    return;
  }

  if (result.status === 'need_more') {
    // Ask the user for the missing information
    const botReply = result.question;
    session.messages.push({ role: 'assistant', content: botReply });
    res.json({ type: 'question', text: botReply });
  } else {
    // All parameters extracted — store the input and ask for confirmation
    session.input = result.input;
    const botReply = result.summary;
    session.messages.push({ role: 'assistant', content: botReply });
    res.json({ type: 'ready', text: botReply, input: result.input });
  }
});

// ── POST /session/:id/confirm — user confirmed; start analysis ────────────────
//
// No request body needed. Starts runWhtAnalysis() in background.
// Returns immediately with { started: true } — progress comes via SSE.
app.post('/session/:id/confirm', (req: Request, res: Response) => {
  const session = getSession(res, String(req.params['id'] ?? ''));
  if (!session) return;

  if (!session.input) {
    res.status(400).json({ error: 'No input ready to confirm. Send more messages first.' });
    return;
  }

  if (session.status !== 'chatting') {
    res.status(400).json({ error: `Cannot confirm — session is in ${session.status} state` });
    return;
  }

  // Phase 10: start the substance interview instead of going straight to analysis.
  // The interview asks 5 questions in the chat. When complete, the /message handler
  // compiles the DDQ text and calls runWhtAnalysis() with the interview answers.
  session.status = 'interviewing';

  const iv = new SubstanceInterviewer();
  session.interviewer    = iv;
  session.interviewState = iv.start(
    session.input.entity_name,
    session.input.country,
    session.input.income_type
  );
  const firstQuestion = iv.getQuestion(session.interviewState);

  res.json({ type: 'interview_start', question: firstQuestion });
});

// ── GET /session/:id/stream — Server-Sent Events stream ───────────────────────
//
// The browser connects here after /confirm. We keep the connection open and
// write events as they arrive from the agent loop.
//
// SSE format: each event is a line starting with "data: " followed by JSON,
// ended by a double newline. The browser's EventSource API parses these.
app.get('/session/:id/stream', (req: Request, res: Response) => {
  const session = getSession(res, String(req.params['id'] ?? ''));
  if (!session) return;

  // Set SSE headers — these tell the browser this is a streaming text connection,
  // not a regular HTTP response that arrives all at once.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();  // Send headers immediately so the browser starts reading

  // If analysis already completed before the browser connected, send the
  // report immediately and close — this handles slow-connect edge cases.
  if (session.status === 'complete' && session.report) {
    const line = `data: ${JSON.stringify({
      type: 'report_saved',
      message: 'Analysis complete.',
      data: { report: session.report },
    })}\n\n`;
    res.write(line);
    res.end();
    return;
  }

  // Register this response as an SSE client
  session.sseClients.push(res);

  // When the browser closes the connection (user navigates away), remove it
  // from the list so we do not try to write to a closed socket.
  req.on('close', () => {
    session.sseClients = session.sseClients.filter(c => c !== res);
  });
});

// ── GET /session/:id/report — fetch the completed report ─────────────────────
app.get('/session/:id/report', (req: Request, res: Response) => {
  const session = getSession(res, String(req.params['id'] ?? ''));
  if (!session) return;

  if (session.status === 'error') {
    res.status(500).json({ error: session.error });
    return;
  }

  if (session.status !== 'complete' || !session.report) {
    res.status(202).json({ status: session.status, message: 'Analysis not yet complete' });
    return;
  }

  res.json(session.report);
});

// ── GET /registry — list all past analyses ───────────────────────────────────
//
// Returns the full registry as JSON: { entries: RegistryEntry[] }.
// Entries are sorted newest-updated-first.
//
// Used by the web UI "Past Analyses" panel.  No authentication — suitable
// for local/single-team use.  A future phase can add role-based access here.
app.get('/registry', (_req: Request, res: Response) => {
  const entries = getRegistry().listAll();
  res.json({ entries });
});

// ── Start server ──────────────────────────────────────────────────────────────

// Ensure the reports directory exists before the server starts accepting requests
fs.mkdirSync(path.resolve('reports'), { recursive: true });

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('WHT AGENT — Web UI');
  console.log('='.repeat(60));
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Open this URL in your browser to start.\n');
});
