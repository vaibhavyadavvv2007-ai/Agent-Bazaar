"use client";

import { useMemo, useState } from "react";
import { useBazaarStream, type LiveEvent, hueFor } from "./EventFeedContext";

/**
 * THE AGENT TRANSCRIPT PANEL.
 * 
 * Shows a live feed of what the agents are thinking (spoke) and doing (tools),
 * rendered as gazette clauses.
 */

type TranscriptLine = {
  id: string;
  ts: string;
  sessionId: string;
  agentName: string;
  hue: string;
  type: "speech" | "tool" | "arrival" | "departure";
  text?: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
};

export default function AgentTranscript() {
  const { last } = useBazaarStream();
  const [filterSession, setFilterSession] = useState<string | null>(null);

  const lines = useMemo(() => {
    const out: TranscriptLine[] = [];
    const seen = new Set<string>();

    for (const e of last) {
      if (!e.session_id) continue;
      const id = e.id ?? `${e.type}:${e.ts}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const ts = e.ts ? new Date(e.ts).toLocaleTimeString("en-IN", { hour12: false }) : "";
      const sessionId = e.session_id;
      const agentName = shortName(String(e.payload?.agent_id ?? "agent"));
      const hue = hueFor(sessionId);

    if (e.type === "agent.arrived") {
      out.push({ id, ts, sessionId, agentName, hue, type: "arrival", text: `[ARRIVED] ${e.payload?.persona ?? "unknown"}` });
    } else if (e.type === "agent.spoke") {
      out.push({ id, ts, sessionId, agentName, hue, type: "speech", text: String(e.payload?.text ?? "") });
    } else if (e.type.startsWith("agent.tool.")) {
      const toolName = e.type.replace("agent.tool.", "");
      const args = e.payload?.args ? JSON.stringify(e.payload.args) : "{}";
      const result = e.payload?.result ? JSON.stringify(e.payload.result) : "{}";
      // Truncate long results for display
      const shortResult = result.length > 1000 ? result.slice(0, 1000) + "..." : result;
      out.push({ id, ts, sessionId, agentName, hue, type: "tool", toolName, toolArgs: args, toolResult: shortResult });
    } else if (e.type === "agent.left") {
      out.push({ id, ts, sessionId, agentName, hue, type: "departure", text: `[DEPARTED] after ${e.payload?.turns ?? 0} turns` });
    }
    }
    
    return out.filter(l => !filterSession || l.sessionId === filterSession);
  }, [last, filterSession]);

  const activeSessions = useMemo(() => {
    const sessions = new Set<string>();
    for (const l of lines) sessions.add(l.sessionId);
    return Array.from(sessions);
  }, [lines]);

  return (
    <section className="rule-box h-fit p-3">
      <header className="flex items-baseline justify-between px-1 pb-2 border-b border-(--paper-edge) mb-2">
        <h2 className="font-masthead text-sm uppercase tracking-[0.08em]">Wiretaps & Transcripts</h2>
        <span className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft)">live feed</span>
      </header>

      {/* Session filter */}
      {activeSessions.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scroll-column">
          <button
            onClick={() => setFilterSession(null)}
            className={`press font-clause text-[11px] uppercase px-2 py-0.5 border ${!filterSession ? "border-(--ink) bg-(--paper-deep) text-(--ink)" : "border-(--paper-edge) bg-transparent text-(--ink-soft)"}`}
          >
            All Agents
          </button>
          {activeSessions.map(sid => (
            <button
              key={sid}
              onClick={() => setFilterSession(sid)}
              className={`press font-clause text-[11px] px-2 py-0.5 border ${filterSession === sid ? "border-(--ink) bg-(--paper-deep) text-(--ink)" : "border-(--paper-edge) bg-transparent text-(--ink-soft)"}`}
              style={{ borderBottomColor: hueFor(sid), borderBottomWidth: filterSession === sid ? '2px' : '1px' }}
            >
              {shortName(sid)}
            </button>
          ))}
        </div>
      )}

      <div className="security-thread-band" aria-hidden="true" />
      <ol className="scroll-column max-h-[400px] space-y-2 overflow-y-auto p-1 pt-2">
        {lines.length === 0 && (
          <li className="border border-dashed border-(--paper-edge) p-4 text-center font-clause text-xs text-(--ink-soft)">
            No agent activity currently recorded.
          </li>
        )}
        {lines.map((l, i) => (
          <li key={l.id + i} className="typeset-in border border-(--paper-edge) bg-(--bazaar-panel) px-3 py-2 font-clause text-[11px]" style={{ borderLeft: `2px solid ${l.hue}` }}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-bold" style={{ color: l.hue }}>{l.agentName}</span>
              <span className="fig text-(--ink-faint)">{l.ts}</span>
            </div>
            
            {l.type === "speech" && (
              <div className="font-body text-[13px] leading-snug italic bg-(--paper-deep) p-1.5 border border-(--paper-edge)">
                “{l.text}”
              </div>
            )}

            {l.type === "tool" && (
              <div className="mt-1">
                <div className="text-(--ink-soft) uppercase text-[11px] tracking-widest font-bold">[{l.toolName}]</div>
                <div className="mt-1 text-(--ink) bg-(--paper) p-1 border border-(--paper-edge) whitespace-pre-wrap overflow-hidden">
                  <span className="text-(--ink-soft)">Args:</span> {l.toolArgs}
                </div>
                {l.toolResult && l.toolResult !== "{}" && (
                  <div className="mt-0.5 text-(--ink-faint) bg-(--paper) p-1 border border-(--paper-edge) border-t-0 whitespace-pre-wrap overflow-hidden">
                    <span className="text-(--ink-soft)">Result:</span> {l.toolResult}
                  </div>
                )}
              </div>
            )}
            
            {(l.type === "arrival" || l.type === "departure") && (
              <div className="font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-soft) mt-1">
                {l.text}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="security-thread-band" aria-hidden="true" />
    </section>
  );
}

function shortName(str: string): string {
  const parts = str.split("/");
  const last = parts[parts.length - 1];
  return last.length > 12 ? `${last.slice(0, 12)}…` : last;
}
