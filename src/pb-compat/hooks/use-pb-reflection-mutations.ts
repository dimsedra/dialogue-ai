import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import type { PbReflections } from "../_generated/dataModel";

export function usePbReflectionSaveComment() {
  const { user } = useAuth();
  const mutate = useMutation<PbReflections>({ collection: "reflections", kind: "update" });
  return async (args: { id: string; userReflection: string }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      id: args.id,
      record: { userReflection: args.userReflection },
    });
    return record.id;
  };
}

export function usePbReflectionToggleShare() {
  const { user } = useAuth();
  const mutate = useMutation<PbReflections>({ collection: "reflections", kind: "update" });
  return async (args: { id: string; shared: boolean }) => {
    if (!user) throw new Error("Unauthorized");
    const record = await mutate({
      id: args.id,
      record: { shared: args.shared },
    });
    return { shared: !!record.shared };
  };
}
