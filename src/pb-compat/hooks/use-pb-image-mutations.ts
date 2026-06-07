import { getPbClient } from "../client";
import { useAuth } from "../auth";

export function usePbImageSave() {
  const { user } = useAuth();
  return async (args: { file: File }) => {
    if (!user) throw new Error("Unauthorized");
    
    const pb = getPbClient();
    const formData = new FormData();
    formData.append("user", user.id);
    formData.append("storageId", args.file);
    formData.append("fileName", args.file.name);
    formData.append("fileType", args.file.type);
    formData.append("createdAt", String(Date.now()));
    
    const record = await pb.collection("user_images").create(formData);
    
    return {
      storageId: record.id,
      url: pb.files.getUrl(record, record.storageId),
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
