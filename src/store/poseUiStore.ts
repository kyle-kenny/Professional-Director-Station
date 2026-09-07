import { create } from 'zustand';
import type { HumanoidJointId, RigControlId } from '../domain/humanoidRig';

type PoseUiState = {
  enabled: boolean;
  actorId?: string;
  selectedJoint?: HumanoidJointId;
  selectedControl?: RigControlId;
  setEnabled: (enabled: boolean, actorId?: string) => void;
  selectJoint: (actorId: string, joint: HumanoidJointId) => void;
  selectControl: (actorId: string, control: RigControlId) => void;
  clearSelection: () => void;
};

export const usePoseUiStore = create<PoseUiState>((set) => ({
  enabled: false,
  setEnabled: (enabled, actorId) => set((state) => ({ enabled, actorId: actorId ?? state.actorId, selectedJoint: enabled ? state.selectedJoint : undefined, selectedControl: enabled ? state.selectedControl : undefined })),
  selectJoint: (actorId, selectedJoint) => set({ enabled: true, actorId, selectedJoint, selectedControl: undefined }),
  selectControl: (actorId, selectedControl) => set({ enabled: true, actorId, selectedControl, selectedJoint: undefined }),
  clearSelection: () => set({ selectedJoint: undefined, selectedControl: undefined }),
}));
