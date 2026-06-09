import { getPbClient } from "../client";
import { resolvePbUrl } from "../client";
import { useAuth } from "../auth";

export function usePbImageSave() {
  const { user } = useAuth();
  return async (args: { file: File }) => {
    if (!user) throw new Error("Unauthorized");

    const pb = getPbClient();
    const buf = await args.file.arrayBuffer();
    console.log(`[pbSaveImage] file="${args.file.name}" type="${args.file.type}" size=${args.file.size} buf=${buf.byteLength}`);
    const blob = new Blob([buf], { type: args.file.type || "image/png" });
    const formData = new FormData();
    formData.append("user", user.id);
    formData.append("storageId", blob, args.file.name);
    formData.append("fileName", args.file.name);
    formData.append("fileType", args.file.type);
    formData.append("createdAt", String(Date.now()));

    const url = `${resolvePbUrl()}/api/collections/user_images/records`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: pb.authStore.token },
      body: formData,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("PB raw error:", errBody);
      throw new Error(`Upload failed: ${errBody.message || res.status}`);
    }
    const record = await res.json();

    return {
      storageId: record.id,
      url: pb.files.getURL(record, record.storageId),
    };
  };
}

export function usePbImageDelete() {
  const { user } = useAuth();
  return async (args: { imageId: string }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    await pb.collection("user_images").delete(args.imageId);
  };
}
