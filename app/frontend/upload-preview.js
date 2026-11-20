import { setIconLabel } from "./icons.js";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
GlobalWorkerOptions.workerSrc = "/assets/pdf-worker.js";

// A detached canvas per render prevents a late PDF from painting over a new source.
export function setupUploadPreview({ loadDocument = getDocument } = {}) {
  const $ = id => document.getElementById(id);
  let sequence = 0, task = null, pdf = null, renderTask = null, page = 1, busy = false;
  function controls() {
    $("upload-pdf-previous").disabled = busy || !pdf || page <= 1;
    $("upload-pdf-next").disabled = busy || !pdf || page >= pdf.numPages;
    $("use-upload-page").disabled = busy || !pdf;
    $("upload-pdf-zoom").disabled = busy || !pdf;
  }
  async function render(token) {
    busy = true; controls();
    try {
      const source = await pdf.getPage(page);
      if (token !== sequence) return;
      const canvas = document.createElement("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `원본 PDF ${page}페이지. 원본 열기로 문서 전체를 확인할 수 있습니다.`);
      const viewport = source.getViewport({ scale: 1.5 });
      canvas.width = viewport.width; canvas.height = viewport.height;
      renderTask = source.render({ canvasContext: canvas.getContext("2d"), viewport });
      await renderTask.promise;
      if (token !== sequence) return;
      $("upload-pdf-canvas").replaceChildren(canvas);
      $("upload-pdf-position").textContent = `${page} / ${pdf.numPages}페이지`;
      $("upload-pdf-status").textContent = "원본 PDF입니다. 문항과 페이지를 대조해 주세요.";
    } catch (error) {
      if (token === sequence && error.name !== "RenderingCancelledException") {
        $("upload-pdf-status").textContent = "PDF를 표시하지 못했습니다. 시험지를 다시 선택하거나 원본 열기를 이용해 주세요.";
        $("upload-pdf-canvas").replaceChildren();
        $("upload-pdf-position").textContent = "";
        pdf = null;
      }
    } finally {
      if (token === sequence) { busy = false; controls(); }
    }
  }
  async function open(exam) {
    const token = ++sequence;
    renderTask?.cancel(); renderTask = null;
    if (task) void task.destroy().catch(() => {});
    task = null; pdf = null; busy = true; page = 1; controls();
    $("upload-pdf-canvas").replaceChildren();
    $("upload-pdf-canvas").dataset.zoom = "false";
    setIconLabel($("upload-pdf-zoom"), "확대", "zoom");
    $("upload-pdf-position").textContent = "";
    if (exam.format !== "pdf") {
      busy = false; controls();
      $("upload-pdf-status").textContent = "HWP는 원본 열기로 내려받아 확인해 주세요. 문항 등록은 PDF에서 지원합니다.";
      return;
    }
    $("upload-pdf-status").textContent = "PDF를 불러오는 중입니다.";
    try {
      task = loadDocument({url: `/api/attachments/${encodeURIComponent(exam.attachment_id)}/file`,
        cMapUrl: "/assets/cmaps/", cMapPacked: true, standardFontDataUrl: "/assets/standard_fonts/",
        useWasm: false, isEvalSupported: false});
      const loaded = await task.promise;
      if (token !== sequence) return;
      pdf = loaded; await render(token);
    } catch {
      if (token === sequence) {
        busy = false; pdf = null; controls();
        $("upload-pdf-status").textContent = "PDF를 불러오지 못했습니다. 시험지를 다시 선택하거나 원본 열기를 이용해 주세요.";
      }
    }
  }
  for (const [id, step] of [["upload-pdf-previous", -1], ["upload-pdf-next", 1]]) {
    $(id).onclick = async () => {
      if (busy || !pdf) return;
      page = Math.max(1, Math.min(pdf.numPages, page + step));
      await render(sequence);
    };
  }
  $("upload-pdf-zoom").onclick = () => {
    const zoom = $("upload-pdf-canvas").dataset.zoom !== "true";
    $("upload-pdf-canvas").dataset.zoom = String(zoom);
    setIconLabel($("upload-pdf-zoom"), zoom ? "너비 맞춤" : "확대", zoom ? "fit" : "zoom");
  };
  return { open, page: () => !busy && pdf ? page : null };
}
