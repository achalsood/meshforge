import { Icon } from "./icon";
import type { useMeshAnalysis } from "@/lib/workspace/use-mesh-analysis";

type MeshAnalysisController = ReturnType<typeof useMeshAnalysis>;

interface IntelligenceDrawerProps {
  controller: MeshAnalysisController;
}

export function IntelligenceDrawer({ controller }: IntelligenceDrawerProps) {
  const {
    analysis, analyzing, applySuggestion, close, error, openFile, run,
    selectedFinding, selectFinding, setTab, tab,
  } = controller;

  return <aside className="intelligence-drawer" aria-label="Mesh Intelligence repository review">
    <header>
      <div><span className="ai-glyph"><Icon name="sparkles"/></span><div><strong>Mesh Intelligence</strong><span>Local repository analysis · no external APIs</span></div></div>
      <div><button className="rerun-analysis" onClick={() => void run()} disabled={analyzing}>{analyzing ? "Analyzing…" : "Run again"}</button><button className="close-intelligence" onClick={close} aria-label="Close Mesh Intelligence">×</button></div>
    </header>
    {error && <div className="analysis-error" role="alert">{error}</div>}
    {analyzing && !analysis ? <div className="analysis-loading"><Icon name="activity" size={25}/><strong>Indexing repository…</strong><span>Building dependency graph, rolling hashes, and risk heap</span><i/></div> : analysis && <>
      <section className="analysis-summary"><div className="health-score"><strong>{analysis.summary.score}</strong><span>health score</span></div><div className={analysis.summary.syntaxErrors ? "syntax-total alert" : "syntax-total"}><strong>{analysis.summary.syntaxErrors}</strong><span>syntax errors</span></div><div><strong>{analysis.summary.findings}</strong><span>findings</span></div><div><strong>{analysis.summary.files}</strong><span>files</span></div><div><strong>{analysis.summary.lines}</strong><span>lines</span></div><div><strong>{analysis.summary.dependencyEdges}</strong><span>edges</span></div><div><strong>{analysis.summary.duplicateBlocks}</strong><span>duplicates</span></div></section>
      <nav className="analysis-tabs" aria-label="Analysis sections">{(["findings", "hotspots", "graph", "algorithms"] as const).map((nextTab) => <button key={nextTab} className={tab === nextTab ? "active" : ""} onClick={() => setTab(nextTab)}>{nextTab}</button>)}</nav>
      <div className="analysis-body">
        {tab === "findings" && <div className="findings-layout"><div className="finding-list">{analysis.findings.length ? analysis.findings.map((finding) => <button key={finding.id} className={selectedFinding?.id === finding.id ? "active" : ""} onClick={() => selectFinding(finding.id)}><span className={`severity ${finding.severity}`}>{finding.severity}</span><div><strong>{finding.title}</strong><code>{finding.path}:{finding.line}:{finding.column}</code></div><em>{finding.category}</em></button>) : <div className="clean-analysis"><Icon name="check" size={25}/><strong>No actionable risks found</strong><span>The repository passed every active rule.</span></div>}</div>{selectedFinding && <article className="finding-detail"><header><span className={`severity ${selectedFinding.severity}`}>{selectedFinding.severity}</span><span>{selectedFinding.category}</span></header><h3>{selectedFinding.title}</h3><p>{selectedFinding.explanation}</p><label>Evidence</label><pre><code>{selectedFinding.evidence}</code></pre><label>Recommendation</label><p>{selectedFinding.suggestion}</p><div className="finding-location"><Icon name="file" size={14}/><code>{selectedFinding.path}:{selectedFinding.line}:{selectedFinding.column}</code><button onClick={() => { openFile(selectedFinding.path); close(); }}>Open file</button></div>{selectedFinding.patch && <button className="apply-patch" onClick={() => applySuggestion(selectedFinding)}><Icon name="sparkles" size={15}/>Apply deterministic patch</button>}</article>}</div>}
        {tab === "hotspots" && <div className="hotspot-list">{analysis.hotspots.map((hotspot, index) => <button key={hotspot.path} onClick={() => { openFile(hotspot.path); close(); }}><strong>#{index + 1}</strong><div><span>{hotspot.path}</span><i style={{width: `${Math.min(100, hotspot.risk)}%`}}/></div><code>C{hotspot.complexity} · {hotspot.lines} lines · {hotspot.imports} imports</code></button>)}</div>}
        {tab === "graph" && <div className="dependency-list"><header><span>Source</span><span>Dependency</span><span>Type</span></header>{analysis.dependencies.length ? analysis.dependencies.map((edge) => <div key={`${edge.from}-${edge.to}`}><code>{edge.from}</code><code>{edge.to}</code><span className={edge.external ? "external" : "internal"}>{edge.external ? "package" : "internal"}</span></div>) : <div className="empty-analysis">No import edges found.</div>}</div>}
        {tab === "algorithms" && <div className="algorithm-grid">{analysis.algorithms.map((algorithm) => <article key={algorithm.name}><Icon name="activity" size={18}/><div><strong>{algorithm.name}</strong><p>{algorithm.purpose}</p></div><code>{algorithm.complexity}</code></article>)}</div>}
      </div>
      <footer className="analysis-footer"><span>Runs inside MeshForge</span><span>Source never leaves your deployment</span><span>{new Date(analysis.generatedAt).toLocaleTimeString()}</span></footer>
    </>}
  </aside>;
}
