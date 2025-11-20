import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGraphEditorStore } from "../useGraphEditorStore";
import type { EntityPayload } from "@/types/messaging";
import { sendRuntimeMessage } from "@/utils/runtime";

vi.mock("@/utils/runtime", () => ({
  sendRuntimeMessage: vi.fn().mockResolvedValue(undefined),
}));

const baseEntities: Record<string, EntityPayload> = {
  root: {
    guid: "root",
    name: "Root",
    parentId: null,
    children: ["level-1"],
    components: {},
  },
  "level-1": {
    guid: "level-1",
    name: "Level 1",
    parentId: "root",
    children: ["level-2"],
    components: {},
  },
  "level-2": {
    guid: "level-2",
    name: "Level 2",
    parentId: "level-1",
    children: [],
    components: {},
  },
};

const resetStore = () => {
  const { reset } = useGraphEditorStore.getState();
  reset();
};

beforeEach(() => {
  resetStore();
  useGraphEditorStore.setState({
    entities: { ...baseEntities },
    rootGuid: "root",
    projectId: 100,
    sceneId: 200,
    isLoading: false,
  });
  vi.clearAllMocks();
});

describe("useGraphEditorStore.reparentEntity", () => {
  it("allows moving a child under the root (ancestor) and sends runtime message", () => {
    const { reparentEntity } = useGraphEditorStore.getState();

    reparentEntity("level-2", "root");

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: "GRAPH_REPARENT_ENTITY",
      payload: {
        entityGuid: "level-2",
        newParentGuid: "root",
        insertIndex: null,
        preserveTransform: true,
      },
    });
  });

  it("prevents reparenting into a descendant and logs a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { reparentEntity } = useGraphEditorStore.getState();

    reparentEntity("level-1", "level-2");

    expect(sendRuntimeMessage).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[GraphEditor] Cannot reparent entity into its own descendant"
    );
    warnSpy.mockRestore();
  });
});
