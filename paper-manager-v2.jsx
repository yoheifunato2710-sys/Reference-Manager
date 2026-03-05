import { useState, useCallback, useEffect, useRef } from "react";
import * as storage from "./storage.js";

// ── サンプルデータ ────────────────────────────────────────────────
const SAMPLE_PAPERS = [
  {
    id: 1,
    title: "Deep Learning Reconstruction in Time-of-Flight MRA: A Phantom Study",
    titleJa: "TOF-MRAにおける深層学習再構成のファントム研究",
    authors: ["Yohei T.", "Tanaka K.", "Suzuki M."],
    journal: "Magnetic Resonance in Medical Sciences",
    year: 2024,
    folder: "MRA研究",
    tags: ["DLR", "TOF-MRA", "AIR Recon DL"],
    status: "reading",
    starred: true,
    abstract: "本研究では、GEのAIR Recon DL技術を用いて深層学習再構成（DLR）と背景抑制処理を組み合わせたTOF-MRAをファントムモデルで評価した。MCA M1およびM3-M4末梢血管セグメントを模したファントムを使用し、SNR改善および血管描出能を定量的に検討した。DLRと背景抑制の併用により、特に細径血管（M3-M4相当）でのSNRが有意に向上することが示された。",
    notes: "重要：M3-M4レベルでのSNR向上が顕著。",
    doi: "10.2463/mrms.mp.2024-0012",
    pdfName: "DLR_MRA_Phantom_2024.pdf",
    pdfFile: null,
    googleDocUrl: null,
    introductionPurpose: "",
    methodsAnalysis: "",
    resultsPurpose: "",
    added: "2025-02-10",
  },
  {
    id: 2,
    title: "Accelerated intracranial TOF MRA with deep learning image enhancement",
    titleJa: "画像ベースの深層学習画像増強を用いた高速脳内TOF-MRA",
    authors: ["Chen H.", "Park J.", "Williams R."],
    journal: "Radiology",
    year: 2023,
    folder: "MRA研究",
    tags: ["AIR Recon DL", "GE", "TOF-MRA"],
    status: "read",
    starred: true,
    abstract: "本研究は、深層学習（DL）ベースの画像増強アルゴリズムを用いた高速脳内タイムオブフライト（TOF）磁気共鳴血管撮影（MRA）の有用性を、3-Tおよび1.5-Tの両磁場強度において評価することを目的とした。129名の患者を対象としたレトロスペクティブ研究において、撮像時間を40%短縮した加速プロトコルにDLベースの画像再構成（TOF-DL）を適用し、従来のTOF-MRA（TOF-Con）と比較した。定量的評価の結果、TOF-DLはTOF-Conに比べ、SNR、CNR、血管の鋭利度（VS）において有意に高い値を示した。",
    notes: "Fig.3のSNRグラフが参考になる。",
    doi: "10.1148/radiol.230456",
    pdfName: null,
    pdfFile: null,
    googleDocUrl: null,
    introductionPurpose: "",
    methodsAnalysis: "",
    resultsPurpose: "",
    added: "2025-01-22",
  },
];

const DEFAULT_FOLDERS = ["すべて", "MRA研究", "放射線科管理", "その他"];
const STATUS_LABELS = { unread: "未読", reading: "読中", read: "読了" };
const STATUS_COLORS = { unread: "#94a3b8", reading: "#fbbf24", read: "#34d399" };
const isPdfFile = (f) => f?.type === "application/pdf" || f?.name?.endsWith(".pdf");

const SI = {
  background: "#07090f",
  border: "1px solid #1a2235",
  borderRadius: 6,
  color: "#dde3ef",
  fontSize: 13,
  padding: "9px 12px",
  width: "100%",
  fontFamily: "'Noto Serif JP',serif",
  outline: "none",
};
const mono = (sz, ls) => ({ fontFamily: "'JetBrains Mono',monospace", fontSize: sz || 10, letterSpacing: ls || "normal" });

// ── Claude API呼び出し（開発時はViteプロキシ経由でCORS・APIキーを回避） ────────────────────────────────────────────
const CLAUDE_API_URL =
  typeof import.meta.env?.VITE_ANTHROPIC_API_URL === "string" && import.meta.env.VITE_ANTHROPIC_API_URL
    ? import.meta.env.VITE_ANTHROPIC_API_URL
    : "/api/anthropic/v1/messages";

async function callClaude(prompt, maxTokens = 800) {
  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.message || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.content?.[0]?.text?.trim() || "";
}

// ── Gemini API呼び出し（無料枠あり。プロキシ経由でキー送信） ────────────────────────────────────────────
// 無料枠: gemini-1.5-flash（2.0-flash は無料枠制限で quota エラーになりやすいため）
const GEMINI_API_URL = "/api/gemini/v1beta/models/gemini-1.5-flash:generateContent";

async function callGemini(prompt, maxTokens = 800) {
  const res = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || data.message || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text.trim() : "";
}

function papersToSave(papersList) {
  return papersList.map((p) => {
    const { pdfFile, ...rest } = p;
    return rest;
  });
}

export default function PaperManager() {
  const [papers, setPapers] = useState([]);
  const [folders, setFolders] = useState(DEFAULT_FOLDERS);
  const [selectedFolder, setSelectedFolder] = useState("すべて");
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("detail");
  const [searchQ, setSearchQ] = useState("");
  const [dragTarget, setDragTarget] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [editingSection, setEditingSection] = useState(null); // 'intro' | 'methods' | 'results'
  const [sectionText, setSectionText] = useState("");

  // データフォルダ（OneDrive等）連携
  const [dataDirHandle, setDataDirHandle] = useState(null);
  // ブラウザでは起動時に自動読み込みしないため、Electron でないときは最初から true にしておく（一瞬のエラー表示を防ぐ）
  const [dataReady, setDataReady] = useState(() => typeof window !== "undefined" && !window.electronAPI);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null); // フォルダから読んだPDFの表示用URL
  const [userStartedNew, setUserStartedNew] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const saveTimeoutRef = useRef(null);

  const handleCreateDesktopShortcut = useCallback(async () => {
    const res = await storage.createDesktopShortcut();
    setShortcutMessage(res?.ok ? "デスクトップにショートカットを作成しました" : res?.error || "作成に失敗しました");
    if (res?.ok) setTimeout(() => setShortcutMessage(""), 3000);
  }, []);
  const handleCreateFolderShortcut = useCallback(async () => {
    const res = await storage.createFolderShortcut();
    setShortcutMessage(res?.ok ? "フォルダ内に「文献管理を開く」ショートカットを作成しました" : res?.error || "作成に失敗しました");
    if (res?.ok) setTimeout(() => setShortcutMessage(""), 3000);
  }, []);

  const showWelcome = dataReady && !dataDirHandle && !userStartedNew;
  const loadFromFolder = useCallback(async () => {
    try {
      setLoadError("");
      const handle = await storage.pickDataFolder();
      if (!handle) return;
      const data = await storage.readDataFromFolder(handle);
      setDataDirHandle(handle);
      if (data) {
        setPapers(Array.isArray(data.papers) ? data.papers : []);
        if (Array.isArray(data.folders) && data.folders.length) setFolders(data.folders);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      setLoadError(msg);
      alert("フォルダの読み込みに失敗しました。\n\n" + msg);
    }
  }, []);
  const loadFromFile = useCallback(async () => {
    const data = await storage.readDataFromFileInput();
    if (!data) return;
    if (data.error) {
      setLoadError(data.error);
      return;
    }
    setPapers(Array.isArray(data.papers) ? data.papers : []);
    if (Array.isArray(data.folders) && data.folders.length) setFolders(data.folders);
    setUserStartedNew(true);
    setLoadError("");
  }, []);
  const startNew = useCallback(() => {
    setUserStartedNew(true);
    setPapers([]);
    setFolders(DEFAULT_FOLDERS);
    setLoadError("");
  }, []);
  const exportData = useCallback(() => {
    storage.downloadData({ papers: papersToSave(papers), folders });
  }, [papers, folders]);

  // 「論文追加」モーダルの状態
  const [showAddModal, setShowAddModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null); // 抽出結果のプレビュー
  const [addFolder, setAddFolder] = useState("MRA研究");
  const [pendingPdf, setPendingPdf] = useState(null); // PDFドロップ待ち
  const [pdfDragOver, setPdfDragOver] = useState(false);

  // ── 起動時: 保存済みフォルダからデータを読む ─────────────────────────────────────────
  // ブラウザではユーザー操作なしでフォルダにアクセスすると requestPermission エラーになるため、
  // Electron のときだけ自動読み込みする。ブラウザは何も触らずウェルカム表示のみ。
  useEffect(() => {
    let cancelled = false;
    const p = (async () => {
      if (!storage.isElectron()) {
        setDataReady(true);
        return;
      }
      try {
        const handle = await storage.getDataDirHandle();
        if (cancelled || !handle) {
          setDataReady(true);
          return;
        }
        const data = await storage.readDataFromFolder(handle);
        if (cancelled) return;
        if (data) {
          setPapers(Array.isArray(data.papers) ? data.papers : []);
          if (Array.isArray(data.folders) && data.folders.length > 0) {
            setFolders(data.folders);
          }
        }
        setDataDirHandle(handle);
      } catch (e) {
        if (!cancelled) {
          await storage.clearDataDirHandle();
          setLoadError("");
        }
      }
      if (!cancelled) setDataReady(true);
    })();
    p.catch(() => {}); // 未処理の reject を防ぎ、Vite のエラーオーバーレイを出さない
    return () => { cancelled = true; };
  }, []);

  // ── データ変更時にフォルダへ保存（デバウンス） ─────────────────
  useEffect(() => {
    if (!dataDirHandle || !dataReady) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await storage.writeDataToFolder(dataDirHandle, {
          papers: papersToSave(papers),
          folders,
        });
      } catch (e) {
        console.error("Save failed", e);
      }
      setSaving(false);
      saveTimeoutRef.current = null;
    }, 800);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [dataDirHandle, dataReady, papers, folders]);

  // 選択論文のPDFをフォルダから読んで表示用URLを更新
  useEffect(() => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    if (!selected?.pdfPath || !dataDirHandle) {
      setPdfBlobUrl(null);
      return;
    }
    let cancelled = false;
    storage.readPdfFromFolder(dataDirHandle, selected.pdfPath).then((url) => {
      if (!cancelled) setPdfBlobUrl(url);
    });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.pdfPath, dataDirHandle]);

  // ── フィルタ ──────────────────────────────────────────────────
  const filtered = papers.filter((p) => {
    const okFolder = selectedFolder === "すべて" || p.folder === selectedFolder;
    const q = searchQ.toLowerCase();
    return okFolder && (!q || p.title.toLowerCase().includes(q) || (p.titleJa || "").includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)));
  });

  const folderCounts = folders.reduce((acc, f) => ({
    ...acc,
    [f]: f === "すべて" ? papers.length : papers.filter((p) => p.folder === f).length,
  }), {});

  const addFolderName = () => {
    const name = window.prompt("新しいフォルダ名");
    if (!name?.trim()) return;
    const n = name.trim();
    if (folders.includes(n)) return;
    setFolders((prev) => ["すべて", ...prev.filter((f) => f !== "すべて"), n]);
  };
  const removeFolder = (folderName) => {
    if (folderName === "すべて") return;
    if (!window.confirm(`「${folderName}」を削除しますか？このフォルダの論文は「その他」に移動します。`)) return;
    setFolders((prev) => {
      const next = prev.filter((f) => f !== folderName);
      if (!next.includes("その他")) return ["すべて", ...next.filter((f) => f !== "すべて"), "その他"];
      return next;
    });
    setPapers((prev) => prev.map((p) => (p.folder === folderName ? { ...p, folder: "その他" } : p)));
    if (selected?.folder === folderName) setSelected((s) => (s ? { ...s, folder: "その他" } : null));
    if (selectedFolder === folderName) setSelectedFolder("すべて");
  };

  const deletePaper = useCallback((id) => {
    if (!window.confirm("この論文を削除しますか？")) return;
    setPapers((prev) => prev.filter((p) => p.id !== id));
    setSelected((prev) => (prev?.id === id ? null : prev));
  }, []);

  const updatePaper = useCallback((id, patch) => {
    setPapers((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
    setSelected((prev) => prev?.id === id ? { ...prev, ...patch } : prev);
  }, []);

  // ── テキストから抽出（AI不使用。形式：1. Title / 2. Abstract / 3. Introduction... / 4. Methods... / 5. Results...） ────────────────────────────────────────
  const extractFromTextWithoutAI = () => {
    if (!pasteText.trim()) return;
    const raw = pasteText.trim();
    const lines = raw.split(/\r?\n/);
    const result = {
      title: "", titleJa: "", authors: [], journal: "", year: new Date().getFullYear(), doi: "",
      abstract: "",
      introductionPurpose: "",
      methodsAnalysis: "",
      resultsPurpose: "",
    };

    // 「1. Title」セクション：次の行から「2.」の手前までがタイトル。英語（日本語）形式なら分割（全角括弧対応）
    const titleSectionMatch = raw.match(/\n1\.\s*Title\s*\n([\s\S]*?)(?=\n2\.|$)/i);
    if (titleSectionMatch) {
      const titleBlock = titleSectionMatch[1].trim();
      const firstLine = titleBlock.split(/\n/)[0].trim();
      const paren = firstLine.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/);
      if (paren) {
        result.title = paren[1].trim();
        result.titleJa = paren[2].trim();
      } else {
        result.title = firstLine;
      }
    }
    // 先頭行が「1. Title」でない長い1行の場合はタイトル候補
    if (!result.title && lines.length > 0) {
      const first = lines[0].trim();
      if (first && !/^\d+\.\s/.test(first) && first.length < 500) {
        const p = first.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/);
        if (p) { result.title = p[1].trim(); result.titleJa = p[2].trim(); }
        else result.title = first;
      }
    }

    // 「2. Abstract (要旨)」セクション：次の行から「3.」の手前までが要旨
    const abstractSectionMatch = raw.match(/\n2\.\s*Abstract\s*(?:\(要旨\))?\s*\n([\s\S]*?)(?=\n3\.|$)/i);
    if (abstractSectionMatch) {
      result.abstract = abstractSectionMatch[1].trim().slice(0, 10000);
    }

    // 「3. Introduction & Purpose (Full Translation)」（番号付きまたは番号なし）
    const introMatch = raw.match(/\n(?:\d+\.\s*)?Introduction\s*&\s*Purpose\s*\(Full Translation\)\s*\n([\s\S]*?)(?=\n\d+\.\s|$)/i);
    if (introMatch) result.introductionPurpose = introMatch[1].trim().slice(0, 15000);

    // 「Methods: Analysis Process」（「5.」など任意の番号付きまたは番号なし）
    const methodsMatch = raw.match(/\n(?:\d+\.\s*)?Methods:\s*Analysis Process\s*\n([\s\S]*?)(?=\n\d+\.\s|$)/i) || raw.match(/\nMethods:\s*Analysis Process\s*\n([\s\S]*?)(?=\n(?:Results|Introduction|\d+\.)|$)/i);
    if (methodsMatch) result.methodsAnalysis = methodsMatch[1].trim().slice(0, 15000);

    // 「Results (Corresponding to Purpose)」（「6.」など任意の番号付きまたは番号なし）
    const resultsMatch = raw.match(/\n(?:\d+\.\s*)?Results\s*\(Corresponding to Purpose\)\s*\n([\s\S]*?)(?=\n\d+\.\s|$)/i) || raw.match(/\nResults\s*\(Corresponding to Purpose\)\s*\n([\s\S]*?)(?=\n\d+\.|$)/i);
    if (resultsMatch) result.resultsPurpose = resultsMatch[1].trim().slice(0, 15000);

    // 文中から年・DOIを補足
    const yearM = raw.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearM) result.year = parseInt(yearM[1], 10);
    const doiM = raw.match(/10\.\d{4,}\/[^\s]+/);
    if (doiM) result.doi = doiM[0];

    setExtracted(result);
  };

  // ── テキストからAI抽出 ────────────────────────────────────────
  const extractFromText = async () => {
    if (!pasteText.trim()) return;
    setExtracting(true);
    setExtracted(null);
    try {
      const raw = await callClaude(`以下は医学論文のNotebookLM要約ドキュメントです。
以下の情報をJSON形式のみで返してください（マークダウン記号不要）。各セクションは該当見出しの直後から次の見出しの手前までの本文をそのまま抽出してください。無い場合はnullまたは空文字にしてください。

{
  "title": "英語タイトル",
  "titleJa": "日本語タイトル",
  "authors": ["著者1", "著者2"],
  "journal": "ジャーナル名（不明ならnull）",
  "year": 発行年の数値（不明なら${new Date().getFullYear()}）,
  "doi": "DOI（不明ならnull）",
  "abstract": "2. Abstract (要旨) の本文",
  "introductionPurpose": "Introduction & Purpose (Full Translation) の本文",
  "methodsAnalysis": "Methods: Analysis Process の本文",
  "resultsPurpose": "Results (Corresponding to Purpose) の本文"
}

ドキュメント内容：
${pasteText.slice(0, 12000)}`, 2000);
      const clean = raw.replace(/```json|```/g, "").trim();
      const info = JSON.parse(clean);
      setExtracted({
        ...info,
        abstract: info.abstract ?? "",
        introductionPurpose: info.introductionPurpose ?? info.introduction ?? "",
        methodsAnalysis: info.methodsAnalysis ?? info.methods ?? "",
        resultsPurpose: info.resultsPurpose ?? info.results ?? "",
      });
    } catch (e) {
      console.error(e);
      const msg = e?.message || String(e);
      if (msg.includes("x-api-key") || msg.includes("401") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("invalid")) {
        alert("APIキーが設定されていません。\n\n1. プロジェクトフォルダに .env を作成\n2. 中に次の1行を追加（ sk-ant-... はご自身のキーに置き換え）:\n   ANTHROPIC_API_KEY=sk-ant-...\n3. ターミナルで npm run dev を一度止めてから再実行");
      } else if (msg.includes("CORS") || msg.includes("Failed to fetch")) {
        alert("ネットワークエラーです。開発サーバー（npm run dev）で開き、.env に ANTHROPIC_API_KEY を設定して再起動してください。");
      } else {
        alert("抽出に失敗しました: " + msg);
      }
    }
    setExtracting(false);
  };

  // ── テキストからAI抽出（Gemini・無料枠あり） ────────────────────────────────────────
  const extractFromTextWithGemini = async () => {
    if (!pasteText.trim()) return;
    setExtracting(true);
    setExtracted(null);
    try {
      const prompt = `以下は医学論文のNotebookLM要約ドキュメントです。
以下の情報をJSON形式のみで返してください（マークダウン不要）。各セクションは該当見出しの直後から次の見出しの手前までの本文をそのまま抽出。無い場合はnullまたは空文字にしてください。

{
  "title": "英語タイトル",
  "titleJa": "日本語タイトル",
  "authors": ["著者1", "著者2"],
  "journal": "ジャーナル名（不明ならnull）",
  "year": 発行年の数値（不明なら${new Date().getFullYear()}）,
  "doi": "DOI（不明ならnull）",
  "abstract": "2. Abstract (要旨) の本文",
  "introductionPurpose": "Introduction & Purpose (Full Translation) の本文",
  "methodsAnalysis": "Methods: Analysis Process の本文",
  "resultsPurpose": "Results (Corresponding to Purpose) の本文"
}

ドキュメント内容：
${pasteText.slice(0, 12000)}`;
      const raw = await callGemini(prompt, 2000);
      const clean = raw.replace(/```json|```/g, "").trim();
      const info = JSON.parse(clean);
      setExtracted({
        ...info,
        abstract: info.abstract ?? "",
        introductionPurpose: info.introductionPurpose ?? info.introduction ?? "",
        methodsAnalysis: info.methodsAnalysis ?? info.methods ?? "",
        resultsPurpose: info.resultsPurpose ?? info.results ?? "",
      });
    } catch (e) {
      console.error(e);
      const msg = e?.message || String(e);
      if (msg.includes("API_KEY") || msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("invalid")) {
        alert("Gemini APIキーが未設定か無効です。.env に GEMINI_API_KEY を追加し、npm run dev を再起動してください。\n\n無料キー取得: https://aistudio.google.com/apikey");
      } else if (msg.includes("quota") || msg.includes("exceeded") || msg.includes("limit")) {
        alert("Gemini の利用枠を超えました。\n\n・しばらく時間をおいて再試行する\n・「見出しで抽出（AI不要）」ボタンでAPIを使わずに抽出する\nのいずれかをお試しください。");
      } else {
        alert("抽出に失敗しました: " + msg);
      }
    }
    setExtracting(false);
  };

  // ── PDF D&D（モーダル内） ─────────────────────────────────────
  const handleModalPdfDrop = (e) => {
    e.preventDefault();
    setPdfDragOver(false);
    const file = Array.from(e.dataTransfer.files).find(isPdfFile);
    if (file) setPendingPdf(file);
  };

  // ── 論文を保存 ─────────────────────────────────────────────────
  const savePaper = async () => {
    if (!extracted) return;
    const id = Date.now();
    const np = {
      id,
      title: extracted.title || "タイトル未設定",
      titleJa: extracted.titleJa || "",
      authors: Array.isArray(extracted.authors) ? extracted.authors : [],
      journal: extracted.journal || "",
      year: extracted.year || new Date().getFullYear(),
      doi: extracted.doi || "",
      abstract: extracted.abstract || "",
      introductionPurpose: extracted.introductionPurpose || "",
      methodsAnalysis: extracted.methodsAnalysis || "",
      resultsPurpose: extracted.resultsPurpose || "",
      notes: "",
      folder: addFolder,
      tags: [],
      status: "unread",
      starred: false,
      pdfName: pendingPdf?.name || null,
      pdfFile: dataDirHandle ? null : pendingPdf || null,
      pdfPath: null,
      googleDocUrl: null,
      added: new Date().toISOString().split("T")[0],
    };
    if (dataDirHandle && pendingPdf) {
      try {
        const path = await storage.writePdfToFolder(dataDirHandle, id, pendingPdf);
        if (path) np.pdfPath = path;
      } catch (e) {
        console.error("PDF save failed", e);
      }
    }
    setPapers((prev) => [np, ...prev]);
    setSelected(np);
    setView("detail");
    setShowAddModal(false);
    setPasteText("");
    setExtracted(null);
    setPendingPdf(null);
  };

  // ── 既存論文へのPDF D&D ────────────────────────────────────────
  const handleRowPdfDrop = useCallback(async (e, id) => {
    e.preventDefault(); e.stopPropagation(); setDragTarget(null);
    const file = Array.from(e.dataTransfer.files).find(isPdfFile);
    if (!file) return;
    if (dataDirHandle) {
      try {
        const path = await storage.writePdfToFolder(dataDirHandle, id, file);
        if (path) updatePaper(id, { pdfPath: path, pdfName: file.name, pdfFile: null });
        else updatePaper(id, { pdfFile: file, pdfName: file.name });
      } catch (err) {
        updatePaper(id, { pdfFile: file, pdfName: file.name });
      }
    } else {
      updatePaper(id, { pdfFile: file, pdfName: file.name });
    }
  }, [updatePaper, dataDirHandle]);

  const openPaper = (paper) => {
    setSelected(paper);
    setView("detail");
    setNotesText(paper.notes);
    setEditingNotes(false);
    setEditingSection(null);
  };

  const handleDetailPdfDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragTarget(null);
    const f = Array.from(e.dataTransfer.files).find(isPdfFile);
    if (!f) return;
    if (dataDirHandle && selected) {
      try {
        const path = await storage.writePdfToFolder(dataDirHandle, selected.id, f);
        if (path) updatePaper(selected.id, { pdfPath: path, pdfName: f.name, pdfFile: null });
        else updatePaper(selected.id, { pdfFile: f, pdfName: f.name });
      } catch {
        updatePaper(selected.id, { pdfFile: f, pdfName: f.name });
      }
    } else if (selected) {
      updatePaper(selected.id, { pdfFile: f, pdfName: f.name });
    }
  }, [dataDirHandle, selected, updatePaper]);

  const cycleStatus = (id, e) => {
    e?.stopPropagation();
    const order = ["unread", "reading", "read"];
    const cur = papers.find((p) => p.id === id)?.status || "unread";
    updatePaper(id, { status: order[(order.indexOf(cur) + 1) % 3] });
  };

  // ── ウェルカム画面（データフォルダ未選択時） ─────────────────────
  if (showWelcome) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "'Noto Serif JP','Georgia',serif", background: "#0b0d14", color: "#dde3ef", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;600&family=JetBrains+Mono:wght@400;500&display=swap');
          .welcome-btn { padding: 14px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; border: 1px solid; transition: all .15s; font-family: 'JetBrains Mono',monospace; }
          .welcome-btn.primary { background: linear-gradient(135deg, rgba(96,165,250,0.2), rgba(96,165,250,0.08)); border-color: rgba(96,165,250,0.4); color: #93c5fd; }
          .welcome-btn.primary:hover { background: linear-gradient(135deg, rgba(96,165,250,0.25), rgba(96,165,250,0.12)); }
          .welcome-btn.secondary { background: transparent; border-color: #1a2235; color: #64748b; }
          .welcome-btn.secondary:hover { border-color: #334155; color: #94a3b8; }
        `}</style>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#1a2235", marginBottom: 8 }}>PAPER MANAGER</div>
        <h1 style={{ fontSize: 22, fontWeight: 300, marginBottom: 8 }}>文献管理</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 28, textAlign: "center", maxWidth: 360 }}>
          OneDriveなど任意のフォルダにデータを保存できます。同じフォルダを選べばどの端末からでも同じデータを参照できます。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
          {storage.hasFolderAccess() && (
            <button type="button" className="welcome-btn primary" onClick={loadFromFolder}>
              フォルダを選択して開く（推奨）
            </button>
          )}
          <button type="button" className="welcome-btn secondary" onClick={loadFromFile}>
            データファイル（JSON）を読み込む
          </button>
          <button type="button" className="welcome-btn secondary" onClick={startNew}>
            新規で始める
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#1a2235", marginTop: 24 }}>
          {storage.hasFolderAccess() ? "フォルダを選択すると、その中の paper-manager-data.json を自動で読み書きします。" : "このブラウザではフォルダ選択が使えません。読み込み・エクスポートでJSONを保存してください。"}
        </p>
        {storage.isElectronApp() && (
          <p style={{ fontSize: 11, color: "#1a2235", marginTop: 12 }}>
            ※ フォルダを開いたあと、<strong>サイドバー上部の「ショートカット」</strong>からデスクトップにアイコンを作成できます。
          </p>
        )}
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Noto Serif JP','Georgia',serif", background: "#0b0d14", color: "#dde3ef", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;600&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#1a2235;border-radius:2px;}
        .row:hover{background:rgba(255,255,255,0.025)!important;cursor:pointer;}
        .row .star-btn:hover{background:rgba(251,191,36,0.12)!important;color:#fbbf24!important;}
        .gh:hover{background:rgba(255,255,255,0.07)!important;}
        .fb:hover{background:rgba(255,255,255,0.05)!important;cursor:pointer;}
        .tag{display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-family:'JetBrains Mono',monospace;background:rgba(96,165,250,0.1);color:#93c5fd;border:1px solid rgba(96,165,250,0.18);margin:2px;}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.82);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:center;justify-content:center;}
        .tab{padding:5px 14px;border-radius:4px;font-size:11px;font-family:'JetBrains Mono',monospace;cursor:pointer;border:1px solid transparent;background:transparent;transition:all .15s;}
        .tab.on{background:rgba(96,165,250,0.15);border-color:rgba(96,165,250,0.35);color:#93c5fd;}
        .tab:not(.on){color:#475569;}.tab:not(.on):hover{border-color:#1a2235;color:#94a3b8;}
        input,select,textarea{outline:none;}textarea{resize:none;}
        .rda{outline:1.5px solid rgba(96,165,250,0.5)!important;background:rgba(96,165,250,0.04)!important;}
        a{color:#60a5fa;text-decoration:none;}a:hover{text-decoration:underline;}
        .drop-zone{border:1.5px dashed rgba(96,165,250,0.2);border-radius:8px;transition:all .18s;}
        .drop-zone.over{border-color:#60a5fa!important;background:rgba(96,165,250,0.07)!important;}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn .25s ease both;}
        .pulse{animation:spin 1.2s linear infinite;display:inline-block;}
      `}</style>

      {/* ── SIDEBAR ──────────────────────────────────────────── */}
      <div style={{ width: 210, background: "#070910", borderRight: "1px solid #131929", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "22px 18px 14px", borderBottom: "1px solid #131929" }}>
          <div style={{ ...mono(9, "0.2em"), color: "#1e2d4a", marginBottom: 5 }}>PAPER MANAGER</div>
          <div style={{ fontSize: 19, fontWeight: 300, letterSpacing: "0.01em" }}>文献管理</div>
          <div style={{ ...mono(9), color: "#1a2235", marginTop: 4 }}>ver {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.1'}</div>
        </div>

        {/* ショートカット（一番上に配置して確実に表示） */}
        <div style={{ padding: "12px 10px 14px", borderBottom: "1px solid #131929", flexShrink: 0 }}>
          <div style={{ ...mono(9, "0.14em"), color: "#1a2235", marginBottom: 8, paddingLeft: 8 }}>ショートカット</div>
          {storage.isElectronApp() ? (
            <>
              <button type="button" onClick={handleCreateDesktopShortcut}
                style={{ width: "100%", marginBottom: 6, padding: "8px 10px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 5, color: "#93c5fd", ...mono(10), cursor: "pointer" }}>
                デスクトップにショートカット
              </button>
              {dataDirHandle && (
                <button type="button" onClick={handleCreateFolderShortcut}
                  style={{ width: "100%", padding: "8px 10px", background: "transparent", border: "1px solid #1a2235", borderRadius: 5, color: "#64748b", ...mono(10), cursor: "pointer" }}>
                  このフォルダにショートカット（ダブルクリックで起動）
                </button>
              )}
              {shortcutMessage && (
                <div style={{ ...mono(9), color: shortcutMessage.includes("失敗") ? "#f87171" : "#34d399", marginTop: 8, paddingLeft: 4 }}>
                  {shortcutMessage}
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: 10, color: "#475569", lineHeight: 1.5, margin: 0 }}>
              デスクトップにアイコンを出すには、<strong>デスクトップアプリ</strong>で起動してください。（<span style={{ fontFamily: "monospace" }}>npm run build</span> → <span style={{ fontFamily: "monospace" }}>npm run electron</span>）
            </p>
          )}
        </div>

        {/* Edit: データフォルダの再指定 */}
        <div style={{ padding: "12px 10px 14px", borderBottom: "1px solid #131929", flexShrink: 0 }}>
          <div style={{ ...mono(9, "0.14em"), color: "#1a2235", marginBottom: 8, paddingLeft: 8 }}>Edit</div>
          {storage.hasFolderAccess() && (
            <button type="button" onClick={loadFromFolder}
              style={{ width: "100%", padding: "8px 10px", background: "transparent", border: "1px solid #1a2235", borderRadius: 5, color: "#64748b", ...mono(10), cursor: "pointer" }}
              title="次回起動時もこのフォルダを参照します">
              データフォルダを変更
            </button>
          )}
        </div>

        <div style={{ padding: "14px 10px 8px", flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ ...mono(9, "0.14em"), color: "#1a2235", marginBottom: 7, paddingLeft: 8 }}>FOLDERS</div>
          {folders.map((f) => (
            <div key={f} className="fb" onClick={() => setSelectedFolder(f)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 5, marginBottom: 1, background: selectedFolder === f ? "rgba(96,165,250,0.09)" : "transparent", borderLeft: `2px solid ${selectedFolder === f ? "#60a5fa" : "transparent"}` }}>
              <span style={{ fontSize: 13, color: selectedFolder === f ? "#93c5fd" : "#64748b" }}>{f}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ ...mono(9), color: "#1a2235" }}>{folderCounts[f]}</span>
                {f !== "すべて" && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeFolder(f); }}
                    style={{ padding: "2px 5px", background: "transparent", border: "none", color: "#3d5070", cursor: "pointer", fontSize: 12 }} title="フォルダを削除">×</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={addFolderName}
            style={{ width: "100%", marginTop: 6, padding: "6px", background: "transparent", border: "1px dashed #1a2235", borderRadius: 5, color: "#3d5070", ...mono(10), cursor: "pointer" }}>
            ＋ フォルダを追加
          </button>
        </div>

        <div style={{ marginTop: "auto", padding: "16px 12px 20px", flexShrink: 0 }}>
          {dataDirHandle && (
            <div style={{ ...mono(9), color: saving ? "#fbbf24" : "#34d399", marginBottom: 8, paddingLeft: 4 }}>
              {saving ? "保存中…" : "フォルダに保存済み"}
            </div>
          )}
          {!dataDirHandle && (
            <button type="button" onClick={loadFromFolder}
              style={{ width: "100%", marginBottom: 8, padding: "8px", background: "transparent", border: "1px dashed #1a2235", borderRadius: 5, color: "#475569", ...mono(10), cursor: "pointer" }}>
            フォルダを選択して保存
            </button>
          )}
          {!dataDirHandle && (
            <button type="button" onClick={exportData}
              style={{ width: "100%", marginBottom: 8, padding: "8px", background: "transparent", border: "1px dashed #1a2235", borderRadius: 5, color: "#475569", ...mono(10), cursor: "pointer" }}>
            データをエクスポート（JSON）
            </button>
          )}
          <button onClick={() => setShowAddModal(true)}
            style={{ width: "100%", padding: "11px", background: "linear-gradient(135deg, rgba(96,165,250,0.18), rgba(96,165,250,0.08))", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 7, color: "#93c5fd", ...mono(11), cursor: "pointer", letterSpacing: "0.06em", lineHeight: 1.5 }}>
            ＋ 論文を追加
          </button>
        </div>
      </div>

      {/* ── PAPER LIST ───────────────────────────────────────── */}
      <div style={{ width: selected ? 330 : "100%", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #131929" }}>
        <div style={{ padding: "13px 14px", borderBottom: "1px solid #131929", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#2d3a52", fontSize: 13 }}>⌕</span>
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="タイトル・タグで検索..."
              style={{ ...SI, padding: "7px 10px 7px 28px", fontSize: 12 }} />
          </div>
          <span style={{ ...mono(9), color: "#2d3a52", whiteSpace: "nowrap" }}>{filtered.length}件</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map((p) => (
            <div key={p.id} className={`row ${dragTarget === p.id ? "rda" : ""}`}
              onClick={() => openPaper(p)}
              onDragOver={(e) => { e.preventDefault(); setDragTarget(p.id); }}
              onDragLeave={() => setDragTarget(null)}
              onDrop={(e) => handleRowPdfDrop(e, p.id)}
              style={{ display: "flex", alignItems: "stretch", padding: "13px 14px", borderBottom: "1px solid #0d1018", background: selected?.id === p.id ? "rgba(96,165,250,0.055)" : "transparent", borderLeft: `2px solid ${selected?.id === p.id ? "#60a5fa" : "transparent"}`, transition: "all .12s" }}>

              {/* 左端：お気に入りマーク */}
              <button
                type="button"
                className="star-btn"
                onClick={(e) => { e.stopPropagation(); updatePaper(p.id, { starred: !p.starred }); }}
                style={{ flexShrink: 0, alignSelf: "center", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", borderRadius: 6, color: p.starred ? "#fbbf24" : "#334155", marginRight: 8 }}
                title={p.starred ? "お気に入りを解除" : "お気に入りに追加"}>
                <span style={{ fontSize: 18 }}>{p.starred ? "★" : "☆"}</span>
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* 英語タイトル */}
                <div style={{ fontSize: 13, color: "#c4cfdf", lineHeight: 1.45, marginBottom: 2 }}>{p.title}</div>
                {/* 日本語タイトル */}
                {p.titleJa && <div style={{ fontSize: 11.5, color: "#60a5fa", fontWeight: 300, lineHeight: 1.4, marginBottom: 5 }}>{p.titleJa}</div>}

                <div style={{ fontSize: 11, color: "#3d5070", fontStyle: "italic", marginBottom: 6 }}>
                  {p.authors.slice(0, 2).join(", ")}{p.authors.length > 2 ? " et al." : ""}{p.year ? ` · ${p.year}` : ""}
                </div>

                <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                  <span onClick={(e) => cycleStatus(p.id, e)}
                    style={{ padding: "2px 8px", borderRadius: 10, ...mono(10), background: STATUS_COLORS[p.status] + "18", color: STATUS_COLORS[p.status], border: `1px solid ${STATUS_COLORS[p.status]}33`, cursor: "pointer" }}>
                    {STATUS_LABELS[p.status]}
                  </span>
                  {(p.pdfFile || p.pdfPath) && <span style={{ ...mono(9), color: "#f87171" }}>📄 PDF</span>}
                  {p.pdfName && !p.pdfFile && !p.pdfPath && <span style={{ ...mono(9), color: "#3d5070" }}>📄 {p.pdfName}</span>}
                  {p.tags.slice(0, 2).map((t) => <span key={t} className="tag">{t}</span>)}
                </div>

                {dragTarget === p.id && (
                  <div style={{ marginTop: 7, padding: "5px 8px", background: "rgba(96,165,250,0.07)", borderRadius: 4, ...mono(9), color: "#93c5fd", textAlign: "center" }}>
                    PDFをここにドロップして紐付け
                  </div>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#1a2235", fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>✦</div>
              論文が見つかりません
            </div>
          )}
        </div>
      </div>

      {/* ── DETAIL PANEL ─────────────────────────────────────── */}
      {selected && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "11px 18px", borderBottom: "1px solid #131929", display: "flex", gap: 5, alignItems: "center" }}>
            <button className={`tab ${view === "detail" ? "on" : ""}`} onClick={() => setView("detail")}>詳細</button>
            {(selected.pdfFile || selected.pdfPath) && <button className={`tab ${view === "pdf" ? "on" : ""}`} onClick={() => setView("pdf")}>📄 PDF</button>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="gh" onClick={(e) => cycleStatus(selected.id, e)}
                style={{ padding: "4px 11px", background: "transparent", border: `1px solid ${STATUS_COLORS[selected.status]}44`, borderRadius: 4, color: STATUS_COLORS[selected.status], ...mono(11), cursor: "pointer" }}>
                {STATUS_LABELS[selected.status]} →
              </button>
              <button className="gh" onClick={() => deletePaper(selected.id)}
                style={{ padding: "4px 10px", background: "transparent", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 4, color: "#f87171", ...mono(10), cursor: "pointer" }} title="論文を削除">削除</button>
              <button className="gh" onClick={() => setSelected(null)}
                style={{ padding: "4px 9px", background: "transparent", border: "1px solid #1a2235", borderRadius: 4, color: "#475569", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          </div>

          {view === "detail" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "26px 30px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#4a6080", fontStyle: "italic", flex: 1 }}>{selected.authors.join(", ")}</div>
                <span onClick={() => updatePaper(selected.id, { starred: !selected.starred })}
                  style={{ cursor: "pointer", fontSize: 18, color: selected.starred ? "#fbbf24" : "#1a2235", flexShrink: 0 }}>
                  {selected.starred ? "★" : "☆"}
                </span>
              </div>
              <div style={{ ...mono(10, "0.08em"), color: "#2d3a52", marginBottom: 16 }}>
                {selected.journal}{selected.year ? ` · ${selected.year}` : ""}
                {selected.doi && <> · <a href={`https://doi.org/${selected.doi}`} target="_blank" rel="noreferrer">DOI ↗</a></>}
              </div>

              <div style={{ marginBottom: 18 }}>{selected.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>

              {/* アブストラクト */}
              <Block label="アブストラクト（日本語要約）">
                {selected.abstract
                  ? <p style={{ fontSize: 14, lineHeight: 1.95, color: "#8fa0b8" }}>{selected.abstract}</p>
                  : <p style={{ fontSize: 13, color: "#2d3a52", fontStyle: "italic" }}>アブストラクトが未設定です</p>
                }
              </Block>

              {/* Introduction & Purpose */}
              <Block label="Introduction & Purpose (Full Translation)"
                action={editingSection === "intro"
                  ? <><Btn green onClick={() => { updatePaper(selected.id, { introductionPurpose: sectionText }); setEditingSection(null); }}>保存</Btn><Btn onClick={() => setEditingSection(null)}>取消</Btn></>
                  : <Btn onClick={() => { setSectionText(selected.introductionPurpose || ""); setEditingSection("intro"); }}>編集</Btn>
                }>
                {editingSection === "intro"
                  ? <textarea value={sectionText} onChange={(e) => setSectionText(e.target.value)} rows={6}
                    style={{ width: "100%", background: "#07090f", border: "1px solid #1a2235", borderRadius: 4, padding: "10px", color: "#dde3ef", fontSize: 14, lineHeight: 1.8, fontFamily: "'Noto Serif JP',serif" }} />
                  : <p style={{ fontSize: 14, lineHeight: 1.95, color: (selected.introductionPurpose || "").trim() ? "#8fa0b8" : "#2d3a52", fontStyle: (selected.introductionPurpose || "").trim() ? "normal" : "italic" }}>
                    {(selected.introductionPurpose || "").trim() || "未設定。編集で追加..."}
                  </p>
                }
              </Block>

              {/* Methods: Analysis Process */}
              <Block label="Methods: Analysis Process"
                action={editingSection === "methods"
                  ? <><Btn green onClick={() => { updatePaper(selected.id, { methodsAnalysis: sectionText }); setEditingSection(null); }}>保存</Btn><Btn onClick={() => setEditingSection(null)}>取消</Btn></>
                  : <Btn onClick={() => { setSectionText(selected.methodsAnalysis || ""); setEditingSection("methods"); }}>編集</Btn>
                }>
                {editingSection === "methods"
                  ? <textarea value={sectionText} onChange={(e) => setSectionText(e.target.value)} rows={6}
                    style={{ width: "100%", background: "#07090f", border: "1px solid #1a2235", borderRadius: 4, padding: "10px", color: "#dde3ef", fontSize: 14, lineHeight: 1.8, fontFamily: "'Noto Serif JP',serif" }} />
                  : <p style={{ fontSize: 14, lineHeight: 1.95, color: (selected.methodsAnalysis || "").trim() ? "#8fa0b8" : "#2d3a52", fontStyle: (selected.methodsAnalysis || "").trim() ? "normal" : "italic" }}>
                    {(selected.methodsAnalysis || "").trim() || "未設定。編集で追加..."}
                  </p>
                }
              </Block>

              {/* Results (Corresponding to Purpose) */}
              <Block label="Results (Corresponding to Purpose)"
                action={editingSection === "results"
                  ? <><Btn green onClick={() => { updatePaper(selected.id, { resultsPurpose: sectionText }); setEditingSection(null); }}>保存</Btn><Btn onClick={() => setEditingSection(null)}>取消</Btn></>
                  : <Btn onClick={() => { setSectionText(selected.resultsPurpose || ""); setEditingSection("results"); }}>編集</Btn>
                }>
                {editingSection === "results"
                  ? <textarea value={sectionText} onChange={(e) => setSectionText(e.target.value)} rows={6}
                    style={{ width: "100%", background: "#07090f", border: "1px solid #1a2235", borderRadius: 4, padding: "10px", color: "#dde3ef", fontSize: 14, lineHeight: 1.8, fontFamily: "'Noto Serif JP',serif" }} />
                  : <p style={{ fontSize: 14, lineHeight: 1.95, color: (selected.resultsPurpose || "").trim() ? "#8fa0b8" : "#2d3a52", fontStyle: (selected.resultsPurpose || "").trim() ? "normal" : "italic" }}>
                    {(selected.resultsPurpose || "").trim() || "未設定。編集で追加..."}
                  </p>
                }
              </Block>

              {/* Google Docs URL */}
              <Block label="Google Docs">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <input
                    type="url"
                    value={selected.googleDocUrl || ""}
                    onChange={(e) => updatePaper(selected.id, { googleDocUrl: e.target.value || null })}
                    placeholder="https://docs.google.com/document/d/..."
                    style={{ ...SI, flex: 1, minWidth: 200, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}
                  />
                  {selected.googleDocUrl && (
                    <a href={selected.googleDocUrl.startsWith("http") ? selected.googleDocUrl : `https://${selected.googleDocUrl}`} target="_blank" rel="noreferrer"
                      style={{ ...mono(10), color: "#60a5fa", whiteSpace: "nowrap" }}>開く ↗</a>
                  )}
                </div>
              </Block>

              {/* メモ */}
              <Block label="メモ"
                action={editingNotes
                  ? <><Btn green onClick={() => { updatePaper(selected.id, { notes: notesText }); setEditingNotes(false); }}>保存</Btn><Btn onClick={() => setEditingNotes(false)}>取消</Btn></>
                  : <Btn onClick={() => { setNotesText(selected.notes); setEditingNotes(true); }}>編集</Btn>
                }>
                {editingNotes
                  ? <textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} rows={5}
                    style={{ width: "100%", background: "#07090f", border: "1px solid #1a2235", borderRadius: 4, padding: "10px", color: "#dde3ef", fontSize: 14, lineHeight: 1.8, fontFamily: "'Noto Serif JP',serif" }} />
                  : <p style={{ fontSize: 14, lineHeight: 1.9, color: selected.notes ? "#8fa0b8" : "#1a2235", fontStyle: selected.notes ? "normal" : "italic" }}>
                    {selected.notes || "メモを追加..."}
                  </p>
                }
              </Block>

              {/* PDF添付エリア */}
              <Block label="PDF">
                {(selected.pdfFile || selected.pdfPath)
                  ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <div>
                      <div style={{ fontSize: 13, color: "#c4cfdf" }}>{selected.pdfName}</div>
                      <button className="gh" onClick={() => setView("pdf")}
                        style={{ ...mono(10), color: "#60a5fa", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0" }}>
                        PDFを表示 →
                      </button>
                    </div>
                    <button className="gh" onClick={() => updatePaper(selected.id, { pdfFile: null, pdfName: null, pdfPath: null })}
                      style={{ marginLeft: "auto", padding: "3px 8px", background: "transparent", border: "1px solid #1a2235", borderRadius: 4, color: "#3d5070", ...mono(10), cursor: "pointer" }}>
                      削除
                    </button>
                  </div>
                  : <div
                    className={`drop-zone ${dragTarget === "detail-pdf" ? "over" : ""}`}
                    style={{ padding: "18px", textAlign: "center", color: dragTarget === "detail-pdf" ? "#93c5fd" : "#2d3a52" }}
                    onDragOver={(e) => { e.preventDefault(); setDragTarget("detail-pdf"); }}
                    onDragLeave={() => setDragTarget(null)}
                    onDrop={(e) => { e.preventDefault(); handleDetailPdfDrop(e); }}>
                    <div style={{ fontSize: 24, marginBottom: 4, opacity: 0.5 }}>📄</div>
                    <div style={{ ...mono(10), lineHeight: 1.6 }}>PDFをここにドロップ</div>
                  </div>
                }
              </Block>

              <div style={{ ...mono(9, "0.08em"), color: "#1a2235", marginTop: 14 }}>追加日: {selected.added} · {selected.folder}</div>
            </div>
          )}

          {view === "pdf" && (selected.pdfFile || selected.pdfPath) && (
            <iframe
              src={
                selected.pdfPath
                  ? pdfBlobUrl
                  : selected.pdfFile
                    ? URL.createObjectURL(selected.pdfFile)
                    : ""
              }
              style={{ flex: 1, border: "none" }}
              title="PDF"
            />
          )}
        </div>
      )}

      {/* ── 論文追加モーダル ──────────────────────────────────── */}
      {showAddModal && (
        <div className="modal-bg" onClick={() => { setShowAddModal(false); setExtracted(null); setPasteText(""); setPendingPdf(null); }}>
          <div className="fade-in" onClick={(e) => e.stopPropagation()}
            style={{ background: "#0b0d14", border: "1px solid #1a2235", borderRadius: 14, width: 620, maxHeight: "88vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>

            {/* モーダルヘッダー */}
            <div style={{ padding: "22px 26px 16px", borderBottom: "1px solid #131929" }}>
              <div style={{ ...mono(9, "0.18em"), color: "#1a2235", marginBottom: 5 }}>NEW PAPER</div>
              <div style={{ fontSize: 18, fontWeight: 300, color: "#e2e8f0" }}>論文を追加</div>
            </div>

            <div style={{ padding: "22px 26px", flex: 1 }}>

              {/* STEP 1: テキスト貼り付け（1. Title / 2. Abstract (要旨) 形式） */}
              <StepLabel n={1} label="要約テキストをここに貼り付け（1. Title / 2. Abstract 形式）" done={!!extracted} />
              <textarea
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setExtracted(null); }}
                placeholder={`例：
1. Title
Accelerated intracranial time-of-flight MR angiography...（画像ベースの深層学習画像増強を用いた...）

2. Abstract (要旨)
本研究は、深層学習（DL）ベースの画像増強アルゴリズムを用いた...`}
                rows={8}
                style={{ ...SI, lineHeight: 1.7, marginBottom: 12, fontSize: 12 }}
              />

              <button
                onClick={extractFromTextWithoutAI}
                disabled={!pasteText.trim()}
                style={{ width: "100%", padding: "10px", background: pasteText.trim() ? "rgba(52,211,153,0.15)" : "rgba(52,211,153,0.05)", border: `1px solid ${pasteText.trim() ? "rgba(52,211,153,0.4)" : "rgba(52,211,153,0.1)"}`, borderRadius: 6, color: pasteText.trim() ? "#34d399" : "#2d3a52", ...mono(11), cursor: pasteText.trim() ? "pointer" : "default", marginBottom: 20, letterSpacing: "0.05em" }}>
                抽出する
              </button>

              {/* 抽出結果プレビュー */}
              {extracted && (
                <div className="fade-in" style={{ background: "#07090f", border: "1px solid #1a2235", borderRadius: 8, padding: "16px 18px", marginBottom: 20 }}>
                  <div style={{ ...mono(9, "0.16em"), color: "#2d3a52", marginBottom: 12 }}>抽出結果プレビュー</div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>英語タイトル</div>
                    <input value={extracted.title || ""} onChange={(e) => setExtracted((d) => ({ ...d, title: e.target.value }))}
                      style={{ ...SI, fontSize: 12 }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>日本語タイトル</div>
                    <input value={extracted.titleJa || ""} onChange={(e) => setExtracted((d) => ({ ...d, titleJa: e.target.value }))}
                      style={{ ...SI, fontSize: 12, color: "#60a5fa" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 2 }}>
                      <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>ジャーナル</div>
                      <input value={extracted.journal || ""} onChange={(e) => setExtracted((d) => ({ ...d, journal: e.target.value }))}
                        style={{ ...SI, fontSize: 12 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>発行年</div>
                      <input value={extracted.year || ""} onChange={(e) => setExtracted((d) => ({ ...d, year: parseInt(e.target.value) || e.target.value }))}
                        style={{ ...SI, fontSize: 12 }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>アブストラクト</div>
                    <textarea value={extracted.abstract || ""} onChange={(e) => setExtracted((d) => ({ ...d, abstract: e.target.value }))} rows={4}
                      style={{ ...SI, fontSize: 12, lineHeight: 1.7 }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>Introduction & Purpose (Full Translation)</div>
                    <textarea value={extracted.introductionPurpose || ""} onChange={(e) => setExtracted((d) => ({ ...d, introductionPurpose: e.target.value }))} rows={3}
                      style={{ ...SI, fontSize: 12, lineHeight: 1.7 }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>Methods: Analysis Process</div>
                    <textarea value={extracted.methodsAnalysis || ""} onChange={(e) => setExtracted((d) => ({ ...d, methodsAnalysis: e.target.value }))} rows={3}
                      style={{ ...SI, fontSize: 12, lineHeight: 1.7 }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>Results (Corresponding to Purpose)</div>
                    <textarea value={extracted.resultsPurpose || ""} onChange={(e) => setExtracted((d) => ({ ...d, resultsPurpose: e.target.value }))} rows={3}
                      style={{ ...SI, fontSize: 12, lineHeight: 1.7 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>フォルダ</div>
                      <select value={addFolder} onChange={(e) => setAddFolder(e.target.value)} style={SI}>
                        {folders.filter((f) => f !== "すべて").map((f) => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...mono(9), color: "#3d5070", marginBottom: 3 }}>DOI</div>
                      <input value={extracted.doi || ""} onChange={(e) => setExtracted((d) => ({ ...d, doi: e.target.value }))}
                        style={{ ...SI, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }} />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: PDF追加（任意） */}
              {extracted && (
                <div className="fade-in">
                  <StepLabel n={2} label="PDFを追加（任意）" done={!!pendingPdf} optional />
                  <div
                    className={`drop-zone ${pdfDragOver ? "over" : ""}`}
                    style={{ padding: pendingPdf ? "12px 16px" : "20px", textAlign: "center", color: pdfDragOver ? "#93c5fd" : "#2d3a52", marginBottom: 20 }}
                    onDragOver={(e) => { e.preventDefault(); setPdfDragOver(true); }}
                    onDragLeave={() => setPdfDragOver(false)}
                    onDrop={handleModalPdfDrop}>
                    {pendingPdf
                      ? <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                        <span style={{ fontSize: 20 }}>📄</span>
                        <span style={{ fontSize: 13, color: "#c4cfdf" }}>{pendingPdf.name}</span>
                        <button onClick={() => setPendingPdf(null)}
                          style={{ ...mono(10), background: "transparent", border: "none", color: "#3d5070", cursor: "pointer" }}>✕</button>
                      </div>
                      : <>
                        <div style={{ fontSize: 22, marginBottom: 4, opacity: 0.4 }}>📄</div>
                        <div style={{ ...mono(10), lineHeight: 1.6 }}>PDFをここにドロップ（後から追加も可）</div>
                      </>
                    }
                  </div>

                  {/* 保存ボタン */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={savePaper}
                      style={{ flex: 1, padding: "11px", background: "linear-gradient(135deg, rgba(96,165,250,0.2), rgba(96,165,250,0.1))", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 7, color: "#93c5fd", ...mono(12), cursor: "pointer", letterSpacing: "0.06em" }}>
                      ✦ 論文を保存
                    </button>
                    <button onClick={() => { setShowAddModal(false); setExtracted(null); setPasteText(""); setPendingPdf(null); }}
                      style={{ padding: "11px 18px", background: "transparent", border: "1px solid #1a2235", borderRadius: 7, color: "#3d5070", ...mono(11), cursor: "pointer" }}>
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── サブコンポーネント ─────────────────────────────────────────────

function StepLabel({ n, label, done, optional }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: done ? "rgba(52,211,153,0.2)" : "rgba(96,165,250,0.15)", border: `1px solid ${done ? "rgba(52,211,153,0.4)" : "rgba(96,165,250,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: done ? "#34d399" : "#93c5fd" }}>{done ? "✓" : n}</span>
      </div>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: done ? "#34d399" : "#93c5fd" }}>{label}</span>
      {optional && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#2d3a52", marginLeft: 2 }}>OPTIONAL</span>}
    </div>
  );
}

function Block({ label, action, children }) {
  return (
    <div style={{ background: "#07090f", border: "1px solid #131929", borderRadius: 8, padding: "16px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: "0.18em", color: "#2d3a52" }}>{label.toUpperCase()}</span>
        {action && <div style={{ display: "flex", gap: 5 }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, green }) {
  const c = green
    ? { bg: "rgba(52,211,153,0.1)", b: "rgba(52,211,153,0.3)", t: "#34d399" }
    : { bg: "transparent", b: "#1a2235", t: "#475569" };
  return (
    <button onClick={onClick}
      style={{ padding: "3px 9px", background: c.bg, border: `1px solid ${c.b}`, borderRadius: 4, color: c.t, fontSize: 10, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer" }}>
      {children}
    </button>
  );
}
