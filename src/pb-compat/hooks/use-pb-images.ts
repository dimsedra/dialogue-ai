import { useQuery } from "../use-query";
import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import { useAuth } from "../auth";
import type { PbUserImages } from "../_generated/dataModel";

const userImagesListQuery = defineQuery<{}, PbUserImages[]>(
  {
    collection: "user_images",
    kind: "list",
    buildFilter: () => "", // Handled by list rule / default fetch
  },
  async () => []
);

export function usePbUserImagesList() {
  const { user } = useAuth();
  const list = useQuery(userImagesListQuery, user ? {} : "skip");
  
  if (!user || !list) return [];
  
  const pb = getPbClient();
  return list.map((record) => ({
    _id: record.id,
    userId: record.user,
    storageId: record.storageId,
    fileName: record.fileName,
    fileType: record.fileType,
    createdAt: record.createdAt,
    url: pb.files.getUrl(record, record.storageId),
  }));
}
