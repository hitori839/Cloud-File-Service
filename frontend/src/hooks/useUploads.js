import { useCallback, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, uploadFile } from "../api/fileApi";
import { errorMessage, formatBytes } from "../utils/format";
import useToast from "./useToast";

let nextId = 1;

/**
 * 업로드 큐 (순차 처리, XHR 진행률).
 * items: [{ id, name, size, progress, status: 'queued'|'uploading'|'done'|'error'|'canceled', error }]
 * completed: 성공한 업로드 수 (데이터 새로고침 트리거로 사용)
 */
export default function useUploads() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [completed, setCompleted] = useState(0);

  const queueRef = useRef([]);
  const activeRef = useRef(null);
  const runningRef = useRef(false);

  const patch = useCallback((id, changes) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    let quotaWarned = false;

    while (queueRef.current.length > 0) {
      const job = queueRef.current.shift();
      patch(job.id, { status: "uploading", progress: 0 });

      const { promise, abort } = uploadFile(job.file, job.folderId, (progress) =>
        patch(job.id, { progress }),
      );
      activeRef.current = { id: job.id, abort };

      try {
        await promise;
        patch(job.id, { status: "done", progress: 100 });
        setCompleted((count) => count + 1);
      } catch (error) {
        if (error?.name === "AbortError") {
          patch(job.id, { status: "canceled" });
        } else {
          const quota = error?.status === 413;
          const message = quota
            ? errorMessage(error, "저장 공간이 부족합니다.")
            : errorMessage(error, "업로드에 실패했습니다.");
          patch(job.id, { status: "error", error: message });
          if (quota && !quotaWarned) {
            quotaWarned = true;
            toast.error(`저장 공간이 부족해 "${job.file.name}"을(를) 업로드하지 못했습니다.`);
          }
          if (error?.status === 401) {
            queueRef.current = [];
            break;
          }
        }
      } finally {
        activeRef.current = null;
      }
    }

    runningRef.current = false;
  }, [patch, toast]);

  const startUpload = useCallback(
    (fileList, folderId = null) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;

      const newItems = [];
      files.forEach((file) => {
        const id = nextId++;
        if (file.size > MAX_UPLOAD_BYTES) {
          newItems.push({
            id,
            name: file.name,
            size: file.size,
            progress: 0,
            status: "error",
            error: `파일당 최대 ${formatBytes(MAX_UPLOAD_BYTES)}까지 업로드할 수 있습니다.`,
          });
          return;
        }
        newItems.push({ id, name: file.name, size: file.size, progress: 0, status: "queued", error: null });
        queueRef.current.push({ id, file, folderId });
      });

      setItems((prev) => [...prev, ...newItems]);
      pump();
    },
    [pump],
  );

  const cancel = useCallback(
    (id) => {
      if (activeRef.current?.id === id) {
        activeRef.current.abort();
        return;
      }
      const before = queueRef.current.length;
      queueRef.current = queueRef.current.filter((job) => job.id !== id);
      if (queueRef.current.length !== before) patch(id, { status: "canceled" });
    },
    [patch],
  );

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status === "queued" || item.status === "uploading"));
  }, []);

  return { items, completed, startUpload, cancel, clearFinished };
}
