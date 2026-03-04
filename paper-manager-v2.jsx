import { useState, useCallback } from "react";

const SAMPLE_PAPERS = [
  {
    id: 1,
    title: "Deep Learning Reconstruction in Time-of-Flight MRA: A Phantom Study",
    titleJa: "TOF-MRAにおける深層学習再構成のファントム研究",
    authors: ["Yohei T.", "Tanaka K.", "Suzuki M."],
    journal: "Magnetic Resonance in Medical Sciences",
    year: 2024,
    folder: "MRA研究",
    tags: ["DLR", "TOF-MRA", "Phantom", "AIR Recon DL"],
    status: "reading",
    starred: true,
    abstract: "本研究では、GEのAIR Recon DL技術を用いて深層学習再構成（DLR）と背景抑制処理を組み合わせたTOF-MRAをファントムモデルで評価した。MCA M1およびM3-M4末梢血管セグメントを模したファントムを使用し、SNR改善および血管描出能を定量的に検討した。DLRと背景抑制の併用により、特に細径血管（M3-M4相当）でのSNRが有意に向上することが示された。",
    notes: "重要：M3-M4レベルでのSNR向上が顕著。背景抑制との組み合わせ効果を要検討。",
    doi: "10.2463/mrms.mp.2024-0012",
    pdfName: "DLR_MRA_Phantom_2024.pdf",
    googleDocUrl: "",
    added: "2025-02-10",
    pdfFile: null,
  },
  {
    id: 2,
    title: "AIR Recon DL: Clinical Evaluation of Deep Learning Image Reconstruction",
    titleJa: "AIR Recon DL：深層学習画像再構成の臨床評価",
    authors: ["Chen H.", "Park J.", "Williams R."],
    journal: "Radiology",
    year: 2023,
    folder: "MRA研究",
    tags: ["AIR Recon DL", "GE", "Clinical"],
    status: "read",
    starred: true,
    abstract: "多施設共同研究としてGE HealthcareのAIR Recon DL技術を複数部位・シーケンスタイプで臨床評価した。全例においてSNRの一貫した改善が認められ、構造的細部の損失は観察されなかった。放射線科医による読影評価でも、従来再構成と比較して診断画質が同等以上であることが確認された。",
    notes: "Fig.3のSNRグラフが参考になる。自施設データと比較予定。",
    doi: "10.1148/radiol.230456",
    pdfName: "AIR_Recon_DL_Clinical_2023.pdf",
    googleDocUrl: "",
    added: "2025-01-22",
    pdfFile: null,
  },
  {
    id: 3,
    title: "Background Suppression Techniques in MR Angiography",
    titleJa: "",
    authors: ["Miyamoto S.", "Okada Y."],
    journal: "Journal of Magnetic Resonance Imaging",
    year: 2023,
    folder: "MRA研究",
    tags: ["Background Suppression", "MRA"],
    status: "unread",
    starred: false,
    abstract: "MRアンギオグラフィーにおける背景抑制法のレビュー。MT飽和法、T1短縮効果、およびそれらが血管視認性と画質指標に与える影響を包括的に論じる。",
    notes: "",
    doi: "10.1002/jmri.28234",
    pdfName: null,
    googleDocUrl: "",
    added: "2025-02-01",
    pdfFile: null,
  },
];

const FOLDERS = ["すべて", "MRA研究", "放射線科管理", "その他"];
const STATUS_LABELS = { unread: "未読", reading: "読中", read: "読了" };
const STATUS_COLORS = { unread: "#94a3b8", reading: "#fbbf24", read: "#34d399" };
const isGoogleDocUrl = (s) => /docs\.google\.com\/document/i.test(s);
const isPdfFile = (f) => f?.type === "application/pdf" || f?.name?.endsWith(".pdf");
const getEmbedUrl = (url) => url?.replace(/\/(edit|view|preview)(\?.*)?$/, "/preview") ?? null;

const SI = { background: "#080a10", border: "1px solid #1e2740", borderRadius: 5, color: "#dde3ef", fontSize: 13, padding: "8px 10px", width: "100%", fontFamily: "'Noto Serif JP',serif", outline: "none" };
const mono = (sz, ls) => ({ fontFamily: "'JetBrains Mono',monospace", fontSize: sz || 10, letterSpacing: ls || "normal" });

export default function PaperManager() {
  const [papers, setPapers] = useState(SAMPLE_PAPERS);
  const [selectedFolder, setSelectedFolder] = useState("すべて");
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("detail");
  const [searchQ, setSearchQ] = useState("");
  const [dragTarget, setDragTarget] = useState(null);
  const [translatingId, setTranslatingId] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [draft, setDraft] = useState({});

  const filtered = papers.filter((p) => {
    const okFolder = selectedFolder === "すべて" || p.folder === selectedFolder;
    const q = searchQ.toLowerCase();
    return okFolder && (!q || p.title.toLowerCase().includes(q) || (p.titleJa || "").includes(q) || p.authors.join(" ").toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)));
  });

  const folderCounts = FOLDERS.reduce((acc, f) => ({ ...acc, [f]: f === "すべて" ? papers.length : papers.filter((p) => p.folder === f).length }), {});

  const updatePaper = useCallback((id, patch) => {
    setPapers((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
    setSelected((prev) => prev?.id === id ? { ...prev, ...patch } : prev);
  }, []);

  const translateTitle = async (id, title) => {
    setTranslatingId(id);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{ role: "user", content: `以下の医学論文タイトルを自然な日本語に翻訳してください。翻訳文のみ返してください：\n${title}` }],
        }),
      });
      const data = await res.json();
      const ja = data.content?.[0]?.text?.trim();
      if (ja) updatePaper(id, { titleJa: ja });
    } catch (e) { console.error(e); }
    setTranslatingId(null);
  };

  const makeBlank = ({ folder, pdfFile, googleDocUrl, title }) => ({
    id: Date.now() + Math.random(),
    title: title || "タイトル未設定",
    titleJa: "",
    authors: [],
    journal: "",
    year: new Date().getFullYear(),
    folder,
    tags: [],
    status: "unread",
    starred: false,
    abstract: "",
    notes: "",
    doi: "",
    pdfName: pdfFile?.name || null,
    pdfFile: pdfFile || null,
    googleDocUrl: googleDocUrl || "",
    added: new Date().toISOString().split("T")[0],
  });

  const handleSidebarDrop = useCallback((e) => {
    e.preventDefault(); setDragTarget(null);
    const url = (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain") || "").trim();
    const pdfFile = Array.from(e.dataTransfer.files).find(isPdfFile);
    const folder = selectedFolder === "すべて" ? "その他" : selectedFolder;
    if (pdfFile) {
      const np = makeBlank({ folder, pdfFile, title: pdfFile.name.replace(/\.pdf$/i, "").replace(/_/g, " ") });
      setPapers((prev) => [np, ...prev]); setSelected(np); setView("pdf"); return;
    }
    if (isGoogleDocUrl(url)) {
      const np = makeBlank({ folder, googleDocUrl: url });
      setPapers((prev) => [np, ...prev]); setSelected(np); setView("gdoc");
    }
  }, [selectedFolder]);

  const handleRowDrop = useCallback((e, id) => {
    e.preventDefault(); e.stopPropagation(); setDragTarget(null);
    const url = (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain") || "").trim();
    const pdfFile = Array.from(e.dataTransfer.files).find(isPdfFile);
    if (pdfFile) { updatePaper(id, { pdfFile, pdfName: pdfFile.name }); return; }
    if (isGoogleDocUrl(url)) updatePaper(id, { googleDocUrl: url });
  }, [updatePaper]);

  const openPaper = (paper, v = "detail") => { setSelected(paper); setView(v); setNotesText(paper.notes); setEditingNotes(false); };

  const cycleStatus = (id, e) => {
    e?.stopPropagation();
    const order = ["unread", "reading", "read"];
    const cur = papers.find((p) => p.id === id)?.status || "unread";
    updatePaper(id, { status: order[(order.indexOf(cur) + 1) % 3] });
  };

  const addManual = () => {
    if (!draft.title) return;
    const np = makeBlank({ folder: draft.folder || "MRA研究", googleDocUrl: draft.googleDocUrl });
    Object.assign(np, {
      title: draft.title || "",
      titleJa: draft.titleJa || "",
      authors: (draft.authors || "").split(",").map((a) => a.trim()).filter(Boolean),
      journal: draft.journal || "",
      year: parseInt(draft.year) || new Date().getFullYear(),
      doi: draft.doi || "",
      abstract: draft.abstract || "",
    });
    setPapers((prev) => [np, ...prev]);
    setShowModal(false); setDraft({});
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Noto Serif JP','Georgia',serif", background: "#0c0e15", color: "#dde3ef", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;600&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#1e2740;border-radius:2px;}
        .row:hover{background:rgba(255,255,255,0.03)!important;cursor:pointer;}
        .gh:hover{background:rgba(255,255,255,0.07)!important;}
        .fb:hover{background:rgba(255,255,255,0.05)!important;cursor:pointer;}
        .tag{display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;background:rgba(96,165,250,0.1);color:#93c5fd;border:1px solid rgba(96,165,250,0.18);margin:2px;}
        .ov{position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;}
        .dr{border:1.5px dashed rgba(96,165,250,0.2);border-radius:8px;transition:all .18s;}
        .dr.hot{border-color:#60a5fa!important;background:rgba(96,165,250,0.07)!important;}
        .tab{padding:5px 14px;border-radius:4px;font-size:11px;font-family:'JetBrains Mono',monospace;cursor:pointer;border:1px solid transparent;transition:all .15s;background:transparent;}
        .tab.on{background:rgba(96,165,250,0.15);border-color:rgba(96,165,250,0.35);color:#93c5fd;}
        .tab:not(.on){color:#475569;}.tab:not(.on):hover{border-color:#1e2740;color:#94a3b8;}
        input,select,textarea{outline:none;}textarea{resize:none;}
        .rda{outline:1px solid rgba(96,165,250,0.45)!important;background:rgba(96,165,250,0.04)!important;}
        a{color:#60a5fa;text-decoration:none;}a:hover{text-decoration:underline;}
      `}</style>

      {/* SIDEBAR */}
      <div style={{ width: 212, background: "#080a10", borderRight: "1px solid #151b2e", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "22px 18px 14px", borderBottom: "1px solid #151b2e" }}>
          <div style={{ ...mono(9, "0.18em"), color: "#2d3748", marginBottom: 5 }}>PAPER VAULT</div>
          <div style={{ fontSize: 20, fontWeight: 300 }}>文献管理</div>
        </div>
        <div style={{ padding: "14px 10px 6px" }}>
          <div style={{ ...mono(9, "0.14em"), color: "#1e2740", marginBottom: 7, paddingLeft: 8 }}>FOLDERS</div>
          {FOLDERS.map((f) => (
            <div key={f} className="fb" onClick={() => setSelectedFolder(f)}
              style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", borderRadius: 5, marginBottom: 1, background: selectedFolder === f ? "rgba(96,165,250,0.09)" : "transparent", borderLeft: `2px solid ${selectedFolder === f ? "#60a5fa" : "transparent"}` }}>
              <span style={{ fontSize: 13, color: selectedFolder === f ? "#93c5fd" : "#64748b" }}>{f}</span>
              <span style={{ ...mono(9), color: "#1e2740" }}>{folderCounts[f]}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", padding: "14px 12px 18px" }}>
          <div className={`dr ${dragTarget === "sb" ? "hot" : ""}`}
            style={{ padding: "16px 10px", textAlign: "center", color: dragTarget === "sb" ? "#93c5fd" : "#334155" }}
            onDragOver={(e) => { e.preventDefault(); setDragTarget("sb"); }}
            onDragLeave={() => setDragTarget(null)}
            onDrop={handleSidebarDrop}>
            <div style={{ fontSize: 22, marginBottom: 4, opacity: 0.5 }}>⊕</div>
            <div style={{ ...mono(9, "0.1em"), lineHeight: 1.7 }}>PDF / Google Docs<br />をドロップして新規追加</div>
          </div>
          <button onClick={() => setShowModal(true)}
            style={{ width: "100%", marginTop: 8, padding: "8px", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 5, color: "#93c5fd", ...mono(11), cursor: "pointer", letterSpacing: "0.05em" }}>
            + 手動追加
          </button>
        </div>
      </div>

      {/* PAPER LIST */}
      <div style={{ width: selected ? 340 : "100%", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #151b2e" }}>
        <div style={{ padding: "13px 14px", borderBottom: "1px solid #151b2e", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#334155", fontSize: 13 }}>⌕</span>
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="タイトル・著者・タグ..."
              style={{ ...SI, padding: "7px 10px 7px 28px" }} />
          </div>
          <span style={{ ...mono(9), color: "#334155", whiteSpace: "nowrap" }}>{filtered.length}件</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map((p) => (
            <div key={p.id} className={`row ${dragTarget === p.id ? "rda" : ""}`}
              onClick={() => openPaper(p)}
              onDragOver={(e) => { e.preventDefault(); setDragTarget(p.id); }}
              onDragLeave={() => setDragTarget(null)}
              onDrop={(e) => handleRowDrop(e, p.id)}
              style={{ padding: "12px 14px", borderBottom: "1px solid #0f1420", background: selected?.id === p.id ? "rgba(96,165,250,0.06)" : "transparent", borderLeft: `2px solid ${selected?.id === p.id ? "#60a5fa" : "transparent"}`, transition: "all .12s" }}>
              <div style={{ fontSize: 13, color: "#c8d3e8", lineHeight: 1.4, marginBottom: 1 }}>{p.title}</div>
              {p.titleJa
                ? <div style={{ fontSize: 12, color: "#60a5fa", fontWeight: 300, lineHeight: 1.4, marginBottom: 5 }}>{p.titleJa}</div>
                : <div onClick={(e) => { e.stopPropagation(); translateTitle(p.id, p.title); }}
                  style={{ ...mono(10), color: "#334155", cursor: "pointer", marginBottom: 5 }}>
                  {translatingId === p.id ? "翻訳中..." : "＋ 日本語タイトルを取得"}
                </div>
              }
              <div style={{ fontSize: 11, color: "#475569", fontStyle: "italic", marginBottom: 5 }}>
                {p.authors.slice(0, 2).join(", ")}{p.authors.length > 2 ? " et al." : ""}{p.year ? ` · ${p.year}` : ""}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                <span onClick={(e) => cycleStatus(p.id, e)}
                  style={{ padding: "2px 8px", borderRadius: 10, ...mono(10), background: STATUS_COLORS[p.status] + "18", color: STATUS_COLORS[p.status], border: `1px solid ${STATUS_COLORS[p.status]}33`, cursor: "pointer" }}>
                  {STATUS_LABELS[p.status]}
                </span>
                {p.pdfFile && <span style={{ ...mono(9), color: "#f87171" }}>📄 PDF</span>}
                {p.pdfName && !p.pdfFile && <span style={{ ...mono(9), color: "#475569" }}>📄</span>}
                {p.googleDocUrl && <span style={{ ...mono(9), color: "#34d399" }}>📝 Doc</span>}
                {p.tags.slice(0, 2).map((t) => <span key={t} className="tag">{t}</span>)}
                <span onClick={(e) => { e.stopPropagation(); updatePaper(p.id, { starred: !p.starred }); }}
                  style={{ marginLeft: "auto", cursor: "pointer", fontSize: 15, color: p.starred ? "#fbbf24" : "#1e2740" }}>
                  {p.starred ? "★" : "☆"}
                </span>
              </div>
              {dragTarget === p.id && (
                <div style={{ marginTop: 6, padding: "4px 8px", background: "rgba(96,165,250,0.07)", borderRadius: 4, ...mono(9), color: "#93c5fd", textAlign: "center" }}>
                  PDFまたはGoogle Docsリンクをここに紐付け
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#1e2740", fontSize: 13 }}>論文が見つかりません</div>}
        </div>
      </div>

      {/* DETAIL PANEL */}
      {selected && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "11px 18px", borderBottom: "1px solid #151b2e", display: "flex", gap: 5, alignItems: "center" }}>
            <button className={`tab ${view === "detail" ? "on" : ""}`} onClick={() => setView("detail")}>詳細</button>
            {(selected.pdfFile || selected.pdfName) &&
              <button className={`tab ${view === "pdf" ? "on" : ""}`} onClick={() => setView("pdf")}>📄 PDF</button>}
            {selected.googleDocUrl &&
              <button className={`tab ${view === "gdoc" ? "on" : ""}`} onClick={() => setView("gdoc")}>📝 Google Doc</button>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="gh" onClick={(e) => cycleStatus(selected.id, e)}
                style={{ padding: "4px 11px", background: "transparent", border: `1px solid ${STATUS_COLORS[selected.status]}44`, borderRadius: 4, color: STATUS_COLORS[selected.status], ...mono(11), cursor: "pointer" }}>
                {STATUS_LABELS[selected.status]} →
              </button>
              <button className="gh" onClick={() => setSelected(null)}
                style={{ padding: "4px 9px", background: "transparent", border: "1px solid #1e2740", borderRadius: 4, color: "#475569", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          </div>

          {view === "detail" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "26px 30px" }}>
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <h1 style={{ flex: 1, fontSize: 18, fontWeight: 300, lineHeight: 1.5, color: "#e2e8f0" }}>{selected.title}</h1>
                  <span onClick={() => updatePaper(selected.id, { starred: !selected.starred })}
                    style={{ cursor: "pointer", fontSize: 19, color: selected.starred ? "#fbbf24" : "#1e2740", flexShrink: 0 }}>
                    {selected.starred ? "★" : "☆"}
                  </span>
                </div>
                {selected.titleJa
                  ? <div style={{ fontSize: 15, color: "#60a5fa", marginTop: 6, fontWeight: 300, lineHeight: 1.5 }}>{selected.titleJa}</div>
                  : <button className="gh" onClick={() => translateTitle(selected.id, selected.title)}
                    style={{ marginTop: 6, padding: "3px 11px", background: "transparent", border: "1px dashed #1e2740", borderRadius: 4, color: "#334155", ...mono(11), cursor: "pointer" }}>
                    {translatingId === selected.id ? "翻訳中..." : "＋ 日本語タイトルをAI生成"}
                  </button>
                }
              </div>
              <div style={{ fontSize: 13, color: "#64748b", fontStyle: "italic", marginBottom: 4 }}>{selected.authors.join(", ")}</div>
              <div style={{ ...mono(10, "0.1em"), color: "#334155", marginBottom: 14 }}>
                {selected.journal}{selected.year ? ` · ${selected.year}` : ""}
                {selected.doi && <> · <a href={`https://doi.org/${selected.doi}`} target="_blank" rel="noreferrer">DOI ↗</a></>}
              </div>
              <div style={{ marginBottom: 16 }}>{selected.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>

              <Block label="アブストラクト（日本語要約）">
                {selected.abstract
                  ? <p style={{ fontSize: 14, lineHeight: 1.9, color: "#94a3b8" }}>{selected.abstract}</p>
                  : <p style={{ fontSize: 13, color: "#334155", fontStyle: "italic" }}>Google Docsタブで要約ドキュメントを確認できます</p>
                }
              </Block>

              <Block label="メモ"
                action={editingNotes
                  ? <><Btn green onClick={() => { updatePaper(selected.id, { notes: notesText }); setEditingNotes(false); }}>保存</Btn><Btn onClick={() => setEditingNotes(false)}>取消</Btn></>
                  : <Btn onClick={() => { setNotesText(selected.notes); setEditingNotes(true); }}>編集</Btn>
                }>
                {editingNotes
                  ? <textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} rows={6}
                    style={{ width: "100%", background: "#080a10", border: "1px solid #1e2740", borderRadius: 4, padding: "10px", color: "#dde3ef", fontSize: 14, lineHeight: 1.8 }} />
                  : <p style={{ fontSize: 14, lineHeight: 1.9, color: selected.notes ? "#94a3b8" : "#1e2740", fontStyle: selected.notes ? "normal" : "italic" }}>
                    {selected.notes || "メモを追加..."}
                  </p>
                }
              </Block>

              <Block label="添付ファイル">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <Chip icon="📄" label={selected.pdfFile ? selected.pdfName : "PDF未添付"} active={!!selected.pdfFile} onClick={() => selected.pdfFile && setView("pdf")} />
                  <Chip icon="📝" label={selected.googleDocUrl ? "Google Doc あり" : "Google Doc未設定"} active={!!selected.googleDocUrl} green onClick={() => selected.googleDocUrl && setView("gdoc")} />
                </div>
                <p style={{ ...mono(9, "0.1em"), color: "#1e2740" }}>論文カードにPDFまたはGoogle DocsリンクをD&Dで紐付けできます</p>
              </Block>

              <div style={{ ...mono(9, "0.1em"), color: "#1e2740", marginTop: 14 }}>追加日: {selected.added} · {selected.folder}</div>
            </div>
          )}

          {view === "pdf" && (
            <div style={{ flex: 1 }}>
              {selected.pdfFile
                ? <iframe src={URL.createObjectURL(selected.pdfFile)} style={{ width: "100%", height: "100%", border: "none" }} title="PDF" />
                : <DZone over={dragTarget === "pdfz"} label={`${selected.pdfName || "PDF"} をドロップして表示`}
                  onDragOver={(e) => { e.preventDefault(); setDragTarget("pdfz"); }}
                  onDragLeave={() => setDragTarget(null)}
                  onDrop={(e) => { e.preventDefault(); setDragTarget(null); handleRowDrop(e, selected.id); }} />
              }
            </div>
          )}

          {view === "gdoc" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 16px", background: "#080a10", borderBottom: "1px solid #151b2e", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ ...mono(10), color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.googleDocUrl}</span>
                <a href={selected.googleDocUrl} target="_blank" rel="noreferrer" style={{ ...mono(11), whiteSpace: "nowrap" }}>Googleで開く ↗</a>
              </div>
              <iframe src={getEmbedUrl(selected.googleDocUrl)} style={{ flex: 1, border: "none" }} title="Google Doc" sandbox="allow-scripts allow-same-origin allow-popups" />
            </div>
          )}
        </div>
      )}

      {/* 手動追加モーダル */}
      {showModal && (
        <div className="ov" onClick={() => setShowModal(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#0c0e15", border: "1px solid #151b2e", borderRadius: 12, padding: "28px", width: 500, maxHeight: "82vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 18, fontWeight: 300, marginBottom: 20, color: "#e2e8f0" }}>論文を手動追加</h2>
            {[["タイトル（英語）*", "title"], ["日本語タイトル", "titleJa"], ["著者（カンマ区切り）", "authors"], ["ジャーナル", "journal"], ["発行年", "year"], ["DOI", "doi"]].map(([lb, k]) => (
              <div key={k} style={{ marginBottom: 11 }}>
                <label style={{ display: "block", ...mono(9, "0.14em"), color: "#334155", marginBottom: 4 }}>{lb.toUpperCase()}</label>
                <input value={draft[k] || ""} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} style={SI} />
              </div>
            ))}
            <div style={{ marginBottom: 11 }}>
              <label style={{ display: "block", ...mono(9, "0.14em"), color: "#334155", marginBottom: 4 }}>FOLDER</label>
              <select value={draft.folder || "MRA研究"} onChange={(e) => setDraft((d) => ({ ...d, folder: e.target.value }))} style={SI}>
                {FOLDERS.filter((f) => f !== "すべて").map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 11 }}>
              <label style={{ display: "block", ...mono(9, "0.14em"), color: "#334155", marginBottom: 4 }}>GOOGLE DOCS URL</label>
              <input value={draft.googleDocUrl || ""} onChange={(e) => setDraft((d) => ({ ...d, googleDocUrl: e.target.value }))}
                placeholder="https://docs.google.com/document/d/..." style={{ ...SI, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }} />
            </div>
            <div style={{ marginBottom: 11 }}>
              <label style={{ display: "block", ...mono(9, "0.14em"), color: "#334155", marginBottom: 4 }}>アブストラクト（日本語）</label>
              <textarea value={draft.abstract || ""} onChange={(e) => setDraft((d) => ({ ...d, abstract: e.target.value }))} rows={4} style={{ ...SI, resize: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={addManual}
                style={{ flex: 1, padding: "9px", background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.35)", borderRadius: 6, color: "#93c5fd", ...mono(11), cursor: "pointer" }}>
                追加
              </button>
              <button onClick={() => setShowModal(false)}
                style={{ padding: "9px 16px", background: "transparent", border: "1px solid #1e2740", borderRadius: 6, color: "#475569", ...mono(11), cursor: "pointer" }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Block({ label, action, children }) {
  return (
    <div style={{ background: "#080a10", border: "1px solid #151b2e", borderRadius: 8, padding: "16px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: "0.16em", color: "#334155" }}>{label.toUpperCase()}</span>
        {action && <div style={{ display: "flex", gap: 5 }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, green }) {
  const c = green ? { bg: "rgba(52,211,153,0.1)", b: "rgba(52,211,153,0.3)", t: "#34d399" } : { bg: "transparent", b: "#1e2740", t: "#475569" };
  return (
    <button onClick={onClick} style={{ padding: "3px 9px", background: c.bg, border: `1px solid ${c.b}`, borderRadius: 4, color: c.t, fontSize: 10, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function Chip({ icon, label, active, green, onClick }) {
  const c = green ? "#34d399" : "#60a5fa";
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 6, background: active ? `${c}10` : "#0f1420", border: `1px solid ${active ? c + "30" : "#1e2740"}`, cursor: active ? "pointer" : "default" }}>
      <span>{icon}</span>
      <span style={{ fontSize: 11, color: active ? c : "#334155", fontFamily: "'JetBrains Mono',monospace" }}>{label}</span>
    </div>
  );
}

function DZone({ over, label, onDragOver, onDragLeave, onDrop }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className={`dr ${over ? "hot" : ""}`}
        style={{ padding: "48px 64px", textAlign: "center", color: over ? "#93c5fd" : "#334155" }}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <div style={{ fontSize: 38, marginBottom: 10, opacity: 0.5 }}>⊕</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{label}</div>
      </div>
    </div>
  );
}
