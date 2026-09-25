import { useMemo } from "react";
import * as driveApi from "../api/driveApi";
import * as fileApi from "../api/fileApi";
import * as folderApi from "../api/folderApi";
import { errorMessage } from "../utils/format";
import useDialogs from "./useDialogs";
import useToast from "./useToast";

/**
 * 파일/폴더 공통 동작. item은 { kind: 'file'|'folder', id, name, ... } 형태.
 * onChanged: 서버 데이터가 바뀌었을 때 호출 (목록/용량 새로고침)
 */
export default function useItemActions(onChanged) {
  const toast = useToast();
  const { confirm, prompt } = useDialogs();

  return useMemo(() => {
    async function run(task, successMessage, fallbackError, options) {
      try {
        const result = await task();
        onChanged();
        if (successMessage) toast.success(successMessage, options);
        return result;
      } catch (error) {
        toast.error(errorMessage(error, fallbackError));
        return undefined;
      }
    }

    function validateName(value) {
      const name = value.trim();
      if (!name) return "이름을 입력해 주세요.";
      if (name.length > 255) return "이름이 너무 깁니다.";
      if (/[\\/]/.test(name)) return "이름에 / 또는 \\ 문자를 사용할 수 없습니다.";
      return null;
    }

    async function restore(item) {
      return run(
        () =>
          item.kind === "folder" ? driveApi.restoreFolder(item.id) : driveApi.restoreFile(item.id),
        `"${item.name}" 항목을 복원했습니다.`,
        "복원하지 못했습니다.",
      );
    }

    return {
      validateName,

      async createFolder(parentFolderId) {
        const name = await prompt({
          title: "새 폴더",
          label: "폴더 이름",
          initialValue: "제목 없는 폴더",
          confirmLabel: "만들기",
          validate: validateName,
        });
        if (name === null) return;
        await run(
          () => folderApi.createFolder(name.trim(), parentFolderId ?? null),
          `"${name.trim()}" 폴더를 만들었습니다.`,
          "폴더를 만들지 못했습니다.",
        );
      },

      async download(file) {
        toast.info(`"${file.name}" 다운로드를 준비하고 있습니다…`);
        try {
          await fileApi.downloadFile(file);
        } catch (error) {
          toast.error(errorMessage(error, "다운로드하지 못했습니다."));
        }
      },

      async rename(item) {
        const name = await prompt({
          title: "이름 바꾸기",
          label: item.kind === "folder" ? "폴더 이름" : "파일 이름",
          initialValue: item.name,
          confirmLabel: "확인",
          selectBaseName: item.kind === "file",
          validate: validateName,
        });
        if (name === null || name.trim() === item.name) return;
        await run(
          () =>
            item.kind === "folder"
              ? folderApi.renameFolder(item.id, name.trim())
              : fileApi.renameFile(item.id, name.trim()),
          "이름을 변경했습니다.",
          "이름을 변경하지 못했습니다.",
        );
      },

      async move(item, targetFolderId, targetName) {
        await run(
          () =>
            item.kind === "folder"
              ? folderApi.moveFolder(item.id, targetFolderId)
              : fileApi.moveFile(item.id, targetFolderId),
          `"${item.name}" 항목을 ${targetName}(으)로 이동했습니다.`,
          "이동하지 못했습니다.",
        );
      },

      async toggleStar(item) {
        const next = !item.starred;
        await run(
          () =>
            item.kind === "folder"
              ? folderApi.starFolder(item.id, next)
              : fileApi.starFile(item.id, next),
          next ? "중요 문서함에 추가했습니다." : "중요 표시를 해제했습니다.",
          "중요 표시를 변경하지 못했습니다.",
        );
      },

      async trash(item) {
        await run(
          () =>
            item.kind === "folder" ? folderApi.trashFolder(item.id) : fileApi.trashFile(item.id),
          `"${item.name}" 항목을 휴지통으로 이동했습니다.`,
          "휴지통으로 이동하지 못했습니다.",
          { action: { label: "실행 취소", onClick: () => restore(item) } },
        );
      },

      restore,

      async deleteForever(item) {
        const ok = await confirm({
          title: "영구적으로 삭제할까요?",
          message:
            item.kind === "folder"
              ? `"${item.name}" 폴더와 그 안의 모든 항목이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`
              : `"${item.name}" 파일이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`,
          confirmLabel: "영구 삭제",
          danger: true,
        });
        if (!ok) return;
        await run(
          () =>
            item.kind === "folder"
              ? driveApi.deleteFolderForever(item.id)
              : driveApi.deleteFileForever(item.id),
          "영구적으로 삭제했습니다.",
          "삭제하지 못했습니다.",
        );
      },

      async emptyTrash() {
        const ok = await confirm({
          title: "휴지통을 비울까요?",
          message: "휴지통의 모든 항목이 영구적으로 삭제되며 되돌릴 수 없습니다.",
          confirmLabel: "휴지통 비우기",
          danger: true,
        });
        if (!ok) return;
        await run(() => driveApi.emptyTrash(), "휴지통을 비웠습니다.", "휴지통을 비우지 못했습니다.");
      },
    };
  }, [confirm, prompt, toast, onChanged]);
}
